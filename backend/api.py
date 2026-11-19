"""FastAPI service for CrediAdapt's authenticated underwriting workflow."""

from __future__ import annotations

import os
import re
import sys
import logging
from html import escape
from io import BytesIO
from contextlib import asynccontextmanager
from datetime import UTC, datetime
from pathlib import Path
from typing import Annotated, Any, Literal, Optional

from bson import ObjectId
from dotenv import load_dotenv
from fastapi import Cookie, Depends, FastAPI, HTTPException, Query, Response, status
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, ConfigDict, Field, field_validator
from pymongo import ReturnDocument
from pymongo.errors import DuplicateKeyError
from fastapi.responses import StreamingResponse
from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle

BASE_DIR = Path(__file__).resolve().parent
logger = logging.getLogger(__name__)
MODEL_VERSION = "1.0.0"
POLICY_VERSION = "1.0.0"
sys.path.insert(0, str(BASE_DIR))
os.chdir(BASE_DIR)
load_dotenv(BASE_DIR / ".env")

from affordability_agent import AffordabilityAgent
from auth import (
    ACCESS_TOKEN_MINUTES,
    REFRESH_TOKEN_DAYS,
    CurrentUser,
    create_access_token,
    create_refresh_token,
    decode_token,
    get_current_user,
    hash_password,
    require_role,
    verify_password,
)
from compliance_explanation_agent import ComplianceExplanationAgentLLM
from customer_profiling_agent import CustomerProfilingAgentLLM, ExtractedProfile
from dataset_generator import generate_loan_dataset
from db import close_database, ensure_indexes, get_database
from loan_simulator_agent import LoanSimulatorAgent
from offer_discount_agent import OfferDiscountAgentLLM
from risk_ml_agent import RiskMLAgent


@asynccontextmanager
async def lifespan(_: FastAPI):
    # Provision before accepting requests so no application is processed only
    # in memory.
    try:
        ensure_indexes()
    except Exception as exc:
        raise RuntimeError("Unable to initialize MongoDB. Check MONGODB_URI and Atlas Network Access.") from exc
    yield
    close_database()


app = FastAPI(
    title="CrediAdapt AI Backend",
    description="Authenticated loan underwriting and application persistence service",
    version="2.0.0",
    lifespan=lifespan,
)

allowed_origins = [
    origin.strip()
    for origin in os.getenv("ALLOWED_ORIGINS", "http://localhost:3000,http://localhost:8080").split(",")
    if origin.strip()
]
app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_credentials=True,
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type"],
)


profiler: Optional[CustomerProfilingAgentLLM] = None
affordability: Optional[AffordabilityAgent] = None
risk_engine: Optional[RiskMLAgent] = None
offer_engine: Optional[OfferDiscountAgentLLM] = None
simulator: Optional[LoanSimulatorAgent] = None
compliance: Optional[ComplianceExplanationAgentLLM] = None


def get_agents():
    """Lazily load the existing underwriting agents once per process."""
    global profiler, affordability, risk_engine, offer_engine, simulator, compliance
    if affordability is None:
        csv_path = BASE_DIR / "loan_risk_dataset.csv"
        if not csv_path.exists():
            generate_loan_dataset()
        try:
            profiler = CustomerProfilingAgentLLM()
        except Exception:
            profiler = None
        affordability = AffordabilityAgent(max_foir=0.60, benchmark_rate=11.5)
        risk_engine = RiskMLAgent(data_path="loan_risk_dataset.csv")
        # PolicyRAG is deliberately excluded from the deploy path: its vector
        # dependencies are too large for the target hosting footprint.
        offer_engine = OfferDiscountAgentLLM(base_rate=11.5)
        simulator = LoanSimulatorAgent()
        try:
            compliance = ComplianceExplanationAgentLLM()
        except Exception:
            compliance = None
    return profiler, affordability, risk_engine, offer_engine, simulator, compliance


class LoanRequest(BaseModel):
    monthly_income: float = Field(..., gt=0)
    age: int = Field(..., ge=18, le=75)
    gender: Literal["Female", "Male", "Other"]
    house_rent: float = Field(default=0.0, ge=0)
    existing_emi: float = Field(default=0.0, ge=0)
    cibil_score: int = Field(..., ge=300, le=900)
    requested_loan: float = Field(..., gt=0)
    requested_tenure: int = Field(..., ge=6, le=84)
    early_closure_month: int = Field(default=18, ge=1, le=84)


class RegisterRequest(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)
    email: str
    password: str = Field(min_length=8, max_length=128)
    full_name: str = Field(min_length=2, max_length=120)

    @field_validator("email")
    @classmethod
    def validate_email(cls, value: str) -> str:
        normalized = value.lower()
        if not re.fullmatch(r"[^\s@]+@[^\s@]+\.[^\s@]+", normalized):
            raise ValueError("Enter a valid email address.")
        return normalized


class LoginRequest(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)
    email: str
    password: str = Field(min_length=1, max_length=128)
    role: Literal["applicant", "officer"]

    @field_validator("email")
    @classmethod
    def normalize_email(cls, value: str) -> str:
        return value.lower()


class CounterOffer(BaseModel):
    amount: float = Field(..., gt=0)
    tenure_months: int = Field(..., ge=6, le=84)
    interest_rate: float = Field(..., gt=0, le=100)


class DecisionRequest(BaseModel):
    action: Literal["approve", "reject", "counter_offer", "request_info"]
    reason: str = Field(..., min_length=1, max_length=2000)
    counter_offer: CounterOffer | None = None

    @field_validator("reason")
    @classmethod
    def strip_reason(cls, value: str) -> str:
        normalized = value.strip()
        if not normalized:
            raise ValueError("A reason is required.")
        return normalized


class ApplicantResponse(BaseModel):
    action: Literal["provide_info", "accept_counter_offer", "decline_counter_offer"]
    message: str | None = Field(default=None, max_length=2000)

    @field_validator("message")
    @classmethod
    def strip_message(cls, value: str | None) -> str | None:
        if value is None:
            return None
        normalized = value.strip()
        return normalized or None


class WithdrawalRequest(BaseModel):
    reason: str | None = Field(default=None, max_length=2000)

    @field_validator("reason")
    @classmethod
    def strip_reason(cls, value: str | None) -> str | None:
        if value is None:
            return None
        normalized = value.strip()
        return normalized or None


class AuthResponse(BaseModel):
    access_token: str
    token_type: Literal["bearer"] = "bearer"
    expires_in: int
    user: CurrentUser


def fallback_explanation(
    is_eligible: bool, decision_type: str, requested_loan: float, recommended_loan: float,
    recommended_tenure: int, interest_rate: float, requested_foir: float, final_foir: float,
    max_foir: float, reason: str, emi: float, risk_band: str, default_prob: float,
    total_discount: float, base_rate: float, closure_month: int, outstanding_principal: float,
    interest_saved: float,
) -> dict[str, str]:
    pct = lambda value: f"{value * 100:.2f}%"
    inr = lambda value: f"₹{round(value):,}"
    if not is_eligible:
        return {
            "executive_summary": "The requested loan is not eligible based on the information provided.",
            "affordability_rationale": f"The requested loan of {inr(requested_loan)} produces a FOIR of {pct(requested_foir)}, above the maximum permitted {pct(max_foir)}. {reason}",
            "risk_and_pricing_rationale": "Risk scoring and pricing were not performed because the application did not clear the affordability check.",
            "smart_prepayment_strategy": "A prepayment plan can be prepared once an affordable loan structure is available.",
        }
    summary = (
        f"The requested loan of {inr(recommended_loan)} over {recommended_tenure} months fits within the affordability limit at an indicative rate of {interest_rate}%."
        if decision_type == "APPROVED_AS_REQUESTED"
        else f"A counter-offer of {inr(recommended_loan)} over {recommended_tenure} months is recommended at an indicative rate of {interest_rate}%."
    )
    return {
        "executive_summary": summary,
        "affordability_rationale": f"Existing obligations plus the proposed EMI of {inr(emi)} give a FOIR of {pct(final_foir)} against the maximum permitted {pct(max_foir)}.",
        "risk_and_pricing_rationale": f"The model places this application in the {risk_band} risk band with a modelled default probability of {pct(default_prob)}. Concessions applied total {total_discount}% off the {base_rate}% base rate.",
        "smart_prepayment_strategy": f"Closing in month {closure_month} leaves an outstanding principal of {inr(outstanding_principal)} and saves approximately {inr(interest_saved)} in interest.",
    }


def explanation_missing_figures(
    explanation: dict[str, str],
    recommended_loan: float,
    interest_rate: float,
    emi: float,
    foir: float,
    is_eligible: bool,
    requested_loan: float,
    requested_foir: float,
) -> list[str]:
    text = " ".join(explanation.values()).replace(",", "")
    numbers = [
        float(token.rstrip("%"))
        for token in re.findall(r"(?<!\d)\d+(?:\.\d+)?%?(?!\d)", text)
    ]
    expected = (
        [
            ("recommended loan", recommended_loan),
            ("interest rate", interest_rate),
            ("EMI", emi),
            ("FOIR", foir * 100),
        ]
        if is_eligible
        else [("requested loan", requested_loan), ("FOIR", requested_foir * 100)]
    )
    return [
        label
        for label, value in expected
        if not any(abs(number - round(value, 2)) <= 0.01 for number in numbers)
    ]


def normalize_narrative_currency(explanation: dict[str, str]) -> dict[str, str]:
    return {
        key: re.sub(r"\bINR\s*(?=[\d,])|\?(?=\s?[\d,])", "₹", value)
        for key, value in explanation.items()
    }


def evaluate_application(req: LoanRequest) -> dict[str, Any]:
    """Run the existing evaluation logic and retain its frontend response shape."""
    p_agent, aff_agent, risk_agent, offer_agent, sim_agent, comp_agent = get_agents()
    assert aff_agent and risk_agent and offer_agent and sim_agent
    user_input = {
        "customer_id": "APPL-AUTO", "monthly_income": req.monthly_income, "age": req.age,
        "gender": req.gender, "house_rent": req.house_rent, "existing_emi": req.existing_emi,
        "cibil_score": req.cibil_score, "requested_loan": req.requested_loan,
        "requested_tenure": req.requested_tenure,
    }
    try:
        profile = p_agent.process(user_input) if p_agent else ExtractedProfile(**user_input)
    except Exception:
        profile = ExtractedProfile(**user_input)

    affordability_result = aff_agent.assess(profile)
    is_eligible = affordability_result.get("is_eligible", False)
    decision_type = affordability_result.get("decision_type", "REJECTED")
    adjusted_loan = affordability_result.get("adjusted_loan", 0.0)
    adjusted_tenure = affordability_result.get("adjusted_tenure", 0)
    calculated_foir = affordability_result.get("foir", 0.0)
    requested_foir = affordability_result.get("requested_foir", 0.0)
    reason = affordability_result.get("reason", "")
    eligibility_message = affordability_result.get("eligibility_message", reason)
    risk_result = risk_agent.evaluate_risk(
        profile, loan_amt=adjusted_loan, tenure=adjusted_tenure, foir=calculated_foir
    )
    risk_band = risk_result.get("risk_band", "NOT_EVALUATED")
    default_prob = risk_result.get("default_probability", 0.0)
    shap_factors = [
        {
            "feature": str(key), "label": str(key).replace("_", " ").title(),
            "impact": round(float(value), 4),
            "direction": "increases_risk" if float(value) >= 0 else "reduces_risk",
        }
        for key, value in risk_result.get("top_shap_factors", [])
    ]
    final_rate, discount_data = offer_agent.compute_discounted_rate(profile)
    policies = [
        {"policy_name": item.policy_name, "discount_percentage": item.discount_percentage, "justification": item.justification}
        for item in getattr(discount_data, "concessions", [])
    ]
    total_discount = getattr(discount_data, "total_discount", 0.0)
    simulation_result = sim_agent.generate_schedule_and_closure(
        principal=adjusted_loan, rate=final_rate if is_eligible else 11.5,
        tenure_months=adjusted_tenure, early_closure_month=req.early_closure_month,
    )
    early_closure = simulation_result.get("early_closure", {})
    outstanding_principal = early_closure.get("outstanding_principal", 0.0)
    interest_saved = early_closure.get("interest_saved", 0.0)
    emi = simulation_result.get("emi", 0.0)
    explanation: dict[str, str] | None = None
    if comp_agent:
        try:
            report = comp_agent.format_final_decision(
                profile, affordability_result, risk_result, final_rate, discount_data, simulation_result
            )
            explanation = {
                "executive_summary": report.executive_summary,
                "affordability_rationale": report.affordability_rationale,
                "risk_and_pricing_rationale": report.risk_and_pricing_rationale,
                "smart_prepayment_strategy": report.smart_prepayment_strategy,
            }
        except Exception:
            explanation = None
    explanation = explanation or fallback_explanation(
        is_eligible, decision_type, req.requested_loan, adjusted_loan, adjusted_tenure,
        final_rate if is_eligible else 0.0, requested_foir, calculated_foir, 0.60, reason,
        emi, risk_band, default_prob, total_discount, 11.5, req.early_closure_month,
        outstanding_principal, interest_saved,
    )
    explanation = normalize_narrative_currency(explanation)
    missing_figures = explanation_missing_figures(
        explanation, adjusted_loan, final_rate if is_eligible else 0.0, emi,
        calculated_foir if is_eligible else requested_foir, is_eligible,
        req.requested_loan, requested_foir,
    )
    if missing_figures:
        logger.warning("AI explanation omitted computed figures: %s", ", ".join(missing_figures))
        explanation = fallback_explanation(
            is_eligible, decision_type, req.requested_loan, adjusted_loan, adjusted_tenure,
            final_rate if is_eligible else 0.0, requested_foir, calculated_foir, 0.60, reason,
            emi, risk_band, default_prob, total_discount, 11.5, req.early_closure_month,
            outstanding_principal, interest_saved,
        )
    total_interest = simulation_result.get("total_interest", 0.0)
    total_cost = simulation_result.get("total_cost", 0.0)
    eligibility_path = None
    if decision_type == "COUNTER_OFFER":
        requested_emi = aff_agent.calculate_emi(
            req.requested_loan, aff_agent.benchmark_rate, req.requested_tenure,
        )
        current_obligations = req.house_rent + req.existing_emi
        total_requested_obligation = current_obligations + requested_emi
        permitted_obligation = req.monthly_income * aff_agent.max_foir
        emi_gap = max(0.0, total_requested_obligation - permitted_obligation)
        available_emi = max(0.0, permitted_obligation - current_obligations)
        eligibility_path = {
            "monthly_existing_emi_to_close": round(min(req.existing_emi, emi_gap), 2),
            "additional_monthly_income_needed": round(
                max(0.0, total_requested_obligation / aff_agent.max_foir - req.monthly_income), 2,
            ),
            "maximum_loan_available_today": round(
                aff_agent.calculate_max_loan(
                    available_emi, aff_agent.benchmark_rate, max(1, adjusted_tenure),
                ), 2,
            ),
        }
    return {
        "applicant": {"customer_id": profile.customer_id, "monthly_income": profile.monthly_income, "age": profile.age, "gender": profile.gender, "house_rent": profile.house_rent, "existing_emi": profile.existing_emi, "cibil_score": profile.cibil_score},
        "requested": {"loan_amount": req.requested_loan, "tenure_months": req.requested_tenure, "early_closure_month": req.early_closure_month},
        "decision_type": decision_type, "is_eligible": is_eligible, "eligibility_message": eligibility_message,
        "reason": reason, "requested_foir": round(requested_foir, 4), "final_foir": round(calculated_foir, 4),
        "eligibility_path": eligibility_path,
        "max_foir": 0.60, "recommended_loan": adjusted_loan, "recommended_tenure": adjusted_tenure,
        "interest_rate": final_rate if is_eligible else 0.0, "base_rate": 11.5, "emi": emi,
        "risk": {"evaluated": is_eligible, "risk_band": risk_band, "default_probability": default_prob, "shap_factors": shap_factors, "message": risk_result.get("message")},
        "policies": policies, "total_discount": total_discount,
        "simulation": {
            "is_simulatable": simulation_result.get("is_simulatable", is_eligible), "emi": emi,
            "total_interest": total_interest, "total_cost": total_cost, "total_payment": total_cost,
            "schedule_length": adjusted_tenure, "closure_month": req.early_closure_month if is_eligible else 0,
            "outstanding_principal": outstanding_principal,
            "interest_paid_until_closure": early_closure.get("interest_paid_until_closure", 0.0),
            "interest_saved": interest_saved,
            "total_repaid_with_closure": early_closure.get("total_repaid", 0.0),
            "message": simulation_result.get("message", "Early closure simulation calculated successfully."),
            "schedule_preview": [],
        },
        "explanation": explanation, "engine_source": "python_multi_agent",
        "model_version": MODEL_VERSION,
    }


def public_user(user: dict) -> CurrentUser:
    return CurrentUser(id=str(user["_id"]), email=user["email"], full_name=user["full_name"], role=user["role"])


def auth_response(user: dict) -> AuthResponse:
    return AuthResponse(access_token=create_access_token(user), expires_in=ACCESS_TOKEN_MINUTES * 60, user=public_user(user))


def set_refresh_cookie(response: Response, token: str) -> None:
    secure = os.getenv("COOKIE_SECURE", "false").lower() == "true"
    response.set_cookie(
        key="crediadapt_refresh", value=token, httponly=True,
        secure=secure, samesite="none" if secure else "lax",
        max_age=REFRESH_TOKEN_DAYS * 24 * 60 * 60, path="/api/auth",
    )


def audit(action: str, application_id: str | None, actor: CurrentUser, details: dict[str, Any] | None = None) -> None:
    get_database().audit_logs.insert_one({
        "timestamp": datetime.now(UTC), "actor_id": actor.id, "actor_role": actor.role,
        "action": action, "application_id": application_id, "details": details or {},
        "model_version": MODEL_VERSION, "policy_version": POLICY_VERSION,
    })


def next_reference() -> str:
    year = datetime.now(UTC).year
    counter = get_database().counters.find_one_and_update(
        {"_id": f"application_reference_{year}"}, {"$inc": {"value": 1}}, upsert=True,
        return_document=ReturnDocument.AFTER,
    )
    return f"CA-{year}-{counter['value']:06d}"


def get_application(application_id: str) -> dict:
    if not ObjectId.is_valid(application_id):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Application not found.")
    document = get_database().applications.find_one({"_id": ObjectId(application_id)})
    if not document:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Application not found.")
    return document


def check_application_access(application: dict, user: CurrentUser) -> None:
    if user.role == "applicant" and application["applicant_id"] != user.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="You do not have access to this application.")


def serialize_application(document: dict) -> dict[str, Any]:
    return {key: value for key, value in document.items() if key != "_id"} | {"id": str(document["_id"])}


def inr_indian(value: float | int) -> str:
    rounded = str(int(round(value)))
    if len(rounded) <= 3:
        return f"₹{rounded}"
    tail = rounded[-3:]
    head = rounded[:-3]
    groups = []
    while head:
        groups.insert(0, head[-2:])
        head = head[:-2]
    return f"₹{','.join(groups)},{tail}"


def register_report_font() -> str:
    font_name = "CrediAdaptReport"
    if font_name in pdfmetrics.getRegisteredFontNames():
        return font_name
    font_candidates = [
        os.getenv("CREDIADAPT_PDF_FONT"),
        "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
        "/usr/share/fonts/dejavu/DejaVuSans.ttf",
        "/usr/share/fonts/truetype/noto/NotoSans-Regular.ttf",
        "C:/Windows/Fonts/arial.ttf",
    ]
    for candidate in font_candidates:
        if candidate and Path(candidate).is_file():
            pdfmetrics.registerFont(TTFont(font_name, candidate))
            return font_name
    raise RuntimeError(
        "No PDF font with rupee-symbol support was found. Install DejaVu Sans or set CREDIADAPT_PDF_FONT."
    )


STATUS_TRANSITIONS = {
    ("SUBMITTED", "UNDER_REVIEW", "officer"),
    ("SUBMITTED", "WITHDRAWN", "applicant"),
    ("UNDER_REVIEW", "APPROVED", "officer"),
    ("UNDER_REVIEW", "REJECTED", "officer"),
    ("UNDER_REVIEW", "COUNTER_OFFERED", "officer"),
    ("UNDER_REVIEW", "INFO_REQUESTED", "officer"),
    ("INFO_REQUESTED", "UNDER_REVIEW", "applicant"),
    ("INFO_REQUESTED", "WITHDRAWN", "applicant"),
    ("COUNTER_OFFERED", "ACCEPTED", "applicant"),
    ("COUNTER_OFFERED", "WITHDRAWN", "applicant"),
}


def transition_application(
    application: dict,
    target_status: str,
    actor: CurrentUser,
    reason: str,
    action: str,
    details: dict[str, Any] | None = None,
) -> dict[str, Any]:
    previous_status = application["status"]
    if (previous_status, target_status, actor.role) not in STATUS_TRANSITIONS:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Cannot transition application from {previous_status} to {target_status}.",
        )

    now = datetime.now(UTC)
    history_entry = {
        "from": previous_status, "to": target_status, "by": actor.id,
        "role": actor.role, "reason": reason, "at": now,
    }
    update_fields: dict[str, Any] = {"status": target_status, "updated_at": now}
    if details and "assigned_officer_id" in details:
        update_fields["assigned_officer_id"] = details["assigned_officer_id"]
    if details and "counter_offer" in details:
        update_fields["counter_offer"] = details["counter_offer"]
    if details and "message" in details and details["message"]:
        update_fields["applicant_response"] = details["message"]
    updated = get_database().applications.update_one(
        {"_id": application["_id"], "status": previous_status},
        {"$set": update_fields, "$push": {"status_history": history_entry}},
    )
    if updated.matched_count != 1:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Application status changed; reload and try again.")

    audit_details = {"from": previous_status, "to": target_status}
    if details:
        audit_details.update({
            key: details[key]
            for key in ("action", "applicant_action", "counter_offer", "assigned_officer_id")
            if key in details
        })
    audit(action, str(application["_id"]), actor, audit_details)
    recipient_id = (
        application["applicant_id"]
        if actor.role == "officer"
        else application.get("assigned_officer_id")
    )
    if recipient_id and recipient_id != actor.id:
        message = (
            f"Your application {application['reference']} is now {target_status.replace('_', ' ').lower()}."
            if actor.role == "officer"
            else f"Applicant responded to {application['reference']}; status is now {target_status.replace('_', ' ').lower()}."
        )
        get_database().notifications.insert_one({
            "user_id": recipient_id,
            "application_id": str(application["_id"]),
            "message": message,
            "read": False,
            "created_at": now,
        })
    return serialize_application(get_application(str(application["_id"])))


@app.get("/api/health")
def health_check():
    return {"status": "healthy", "service": "CrediAdapt AI Python Backend", "version": "2.0.0", "agents_count": 6}


@app.post("/api/auth/register", response_model=AuthResponse, status_code=status.HTTP_201_CREATED)
def register(payload: RegisterRequest, response: Response):
    user = {
        "email": payload.email, "password_hash": hash_password(payload.password), "full_name": payload.full_name,
        "role": "applicant", "created_at": datetime.now(UTC), "is_active": True,
    }
    try:
        inserted = get_database().users.insert_one(user)
    except DuplicateKeyError as exc:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="An account with this email already exists.") from exc
    user["_id"] = inserted.inserted_id
    current = public_user(user)
    audit("applicant_registered", None, current)
    set_refresh_cookie(response, create_refresh_token(user))
    return auth_response(user)


@app.post("/api/auth/login", response_model=AuthResponse)
def login(payload: LoginRequest, response: Response):
    user = get_database().users.find_one({"email": payload.email})
    if not user or not user.get("is_active") or not verify_password(payload.password, user.get("password_hash", "")):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid email or password.")
    if user["role"] != payload.role:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=f"This account is registered as an {user['role']}. Use the matching sign-in page.")
    current = public_user(user)
    audit("user_logged_in", None, current)
    set_refresh_cookie(response, create_refresh_token(user))
    return auth_response(user)


@app.post("/api/auth/refresh", response_model=AuthResponse)
def refresh(response: Response, crediadapt_refresh: str | None = Cookie(default=None)):
    if not crediadapt_refresh:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Refresh token is required.")
    payload = decode_token(crediadapt_refresh, "refresh")
    if not ObjectId.is_valid(payload["sub"]):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid refresh token.")
    user = get_database().users.find_one({"_id": ObjectId(payload["sub"]), "is_active": True})
    if not user or user["role"] != payload["role"]:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Refresh token is no longer valid.")
    set_refresh_cookie(response, create_refresh_token(user))
    return auth_response(user)


@app.post("/api/auth/logout", status_code=status.HTTP_204_NO_CONTENT)
def logout(response: Response):
    response.delete_cookie("crediadapt_refresh", path="/api/auth")


@app.get("/api/auth/me", response_model=CurrentUser)
def me(current_user: Annotated[CurrentUser, Depends(get_current_user)]):
    return current_user


@app.post("/api/evaluate-loan")
def evaluate_loan(req: LoanRequest, _: Annotated[CurrentUser, Depends(get_current_user)]):
    """Authenticated non-persistent evaluation retained for API compatibility."""
    return evaluate_application(req)


@app.post("/api/recommendations", status_code=status.HTTP_201_CREATED)
def create_recommendation(req: LoanRequest, current_user: Annotated[CurrentUser, Depends(require_role("applicant"))]):
    result = evaluate_application(req)
    now = datetime.now(UTC)
    history = [{"from": None, "to": "SUBMITTED", "by": current_user.id, "role": current_user.role, "reason": "Application submitted", "at": now}]
    application = {
        "reference": next_reference(), "applicant_id": current_user.id, "input": req.model_dump(),
        "result": result, "status": "SUBMITTED", "status_history": history,
        "assigned_officer_id": None, "created_at": now, "updated_at": now,
    }
    inserted = get_database().applications.insert_one(application)
    application["_id"] = inserted.inserted_id
    audit("application_submitted", str(inserted.inserted_id), current_user, {"reference": application["reference"]})
    return serialize_application(application)


@app.get("/api/recommendations/{application_id}")
def recommendation(application_id: str, current_user: Annotated[CurrentUser, Depends(get_current_user)]):
    application = get_application(application_id)
    check_application_access(application, current_user)
    return serialize_application(application)


@app.get("/api/applications")
def applications(current_user: Annotated[CurrentUser, Depends(get_current_user)]):
    query = {} if current_user.role == "officer" else {"applicant_id": current_user.id}
    documents = get_database().applications.find(query).sort("created_at", -1)
    return {"items": [serialize_application(document) for document in documents]}


@app.get("/api/officer/queue")
def officer_queue(
    current_user: Annotated[CurrentUser, Depends(require_role("officer"))],
    application_status: Annotated[str | None, Query(alias="status")] = None,
    risk_band: str | None = None,
    date_from: datetime | None = None,
    date_to: datetime | None = None,
    search: str | None = None,
):
    query = {"status": application_status} if application_status else {}
    documents = list(get_database().applications.find(query).sort("created_at", -1))
    normalized_search = search.strip().lower() if search else None
    filtered = []
    for document in documents:
        if risk_band and document.get("result", {}).get("risk", {}).get("risk_band") != risk_band.upper():
            continue
        created_at = document.get("created_at")
        if date_from and (not created_at or created_at < date_from):
            continue
        if date_to and (not created_at or created_at > date_to):
            continue
        applicant = get_database().users.find_one({"_id": ObjectId(document["applicant_id"])})
        if normalized_search:
            searchable = " ".join(
                [document.get("reference", ""), applicant.get("email", "") if applicant else "",
                 applicant.get("full_name", "") if applicant else ""]
            ).lower()
            if normalized_search not in searchable:
                continue
        filtered.append(serialize_application(document) | {
            "applicant_name": applicant.get("full_name") if applicant else None,
            "applicant_email": applicant.get("email") if applicant else None,
        })
    return {"items": filtered}


@app.get("/api/officer/analytics")
def officer_analytics(current_user: Annotated[CurrentUser, Depends(require_role("officer"))]):
    applications = list(get_database().applications.find({}))
    status_counts: dict[str, int] = {}
    risk_counts = {"LOW": 0, "MEDIUM": 0, "HIGH": 0, "NOT_EVALUATED": 0}
    risk_outcomes: dict[str, dict[str, int]] = {}
    decision_durations: list[float] = []
    for application in applications:
        application_status = application.get("status", "UNKNOWN")
        status_counts[application_status] = status_counts.get(application_status, 0) + 1
        risk = application.get("result", {}).get("risk", {}).get("risk_band", "NOT_EVALUATED")
        risk_counts[risk] = risk_counts.get(risk, 0) + 1
        if application_status in {"APPROVED", "ACCEPTED", "REJECTED"}:
            outcomes = risk_outcomes.setdefault(risk, {"approved": 0, "rejected": 0})
            outcomes["rejected" if application_status == "REJECTED" else "approved"] += 1
        decision_entry = next(
            (
                entry for entry in application.get("status_history", [])
                if entry.get("to") in {"APPROVED", "REJECTED", "COUNTER_OFFERED"}
            ),
            None,
        )
        if decision_entry and application.get("created_at") and decision_entry.get("at"):
            duration = (decision_entry["at"] - application["created_at"]).total_seconds() / 3600
            decision_durations.append(max(0.0, duration))
    approved = status_counts.get("APPROVED", 0) + status_counts.get("ACCEPTED", 0)
    declined = status_counts.get("REJECTED", 0)
    final_decisions = approved + declined
    approval_rate_by_risk = {
        risk: round(values["approved"] / (values["approved"] + values["rejected"]), 4)
        if values["approved"] + values["rejected"] else None
        for risk, values in risk_outcomes.items()
    }
    return {
        "total_applications": len(applications),
        "status_counts": status_counts,
        "risk_mix": risk_counts,
        "approval_rate": round(approved / final_decisions, 4) if final_decisions else None,
        "approval_rate_by_risk": approval_rate_by_risk,
        "average_hours_to_decision": round(sum(decision_durations) / len(decision_durations), 2)
        if decision_durations else None,
    }


@app.get("/api/officer/applications/{application_id}")
def officer_application(
    application_id: str,
    current_user: Annotated[CurrentUser, Depends(require_role("officer"))],
):
    application = get_application(application_id)
    applicant = get_database().users.find_one({"_id": ObjectId(application["applicant_id"])})
    return {
        "application": serialize_application(application),
        "applicant": public_user(applicant).model_dump() if applicant else None,
    }


@app.post("/api/officer/applications/{application_id}/start-review")
def start_review(
    application_id: str,
    current_user: Annotated[CurrentUser, Depends(require_role("officer"))],
):
    application = get_application(application_id)
    updated = transition_application(
        application, "UNDER_REVIEW", current_user, "Officer started review.",
        "application_review_started", {"assigned_officer_id": current_user.id},
    )
    get_database().reviews.insert_one({
        "application_id": application_id, "officer_id": current_user.id,
        "action": "start_review", "reason": "Officer started review.",
        "created_at": datetime.now(UTC),
    })
    return updated


@app.post("/api/officer/applications/{application_id}/decision")
def officer_decision(
    application_id: str,
    payload: DecisionRequest,
    current_user: Annotated[CurrentUser, Depends(require_role("officer"))],
):
    application = get_application(application_id)
    target_status = {
        "approve": "APPROVED",
        "reject": "REJECTED",
        "counter_offer": "COUNTER_OFFERED",
        "request_info": "INFO_REQUESTED",
    }[payload.action]
    if payload.action == "counter_offer" and payload.counter_offer is None:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Counter-offer terms are required.")
    if payload.action != "counter_offer" and payload.counter_offer is not None:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Counter-offer terms are only valid for a counter-offer.")
    expected_action = {
        "APPROVED_AS_REQUESTED": "approve",
        "COUNTER_OFFER": "counter_offer",
        "REJECTED": "reject",
    }.get(application.get("result", {}).get("decision_type"))
    if payload.action in {"approve", "reject", "counter_offer"} and payload.action != expected_action and not payload.reason:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="A written reason is required when the decision differs from the AI recommendation.")

    details: dict[str, Any] = {"action": payload.action}
    if payload.counter_offer:
        details["counter_offer"] = payload.counter_offer.model_dump()
    updated = transition_application(
        application, target_status, current_user, payload.reason,
        "application_decision", details,
    )
    get_database().reviews.insert_one({
        "application_id": application_id, "officer_id": current_user.id,
        "action": payload.action, "reason": payload.reason,
        "counter_offer": payload.counter_offer.model_dump() if payload.counter_offer else None,
        "created_at": datetime.now(UTC),
    })
    return updated


@app.post("/api/applications/{application_id}/respond")
def applicant_response(
    application_id: str,
    payload: ApplicantResponse,
    current_user: Annotated[CurrentUser, Depends(require_role("applicant"))],
):
    application = get_application(application_id)
    check_application_access(application, current_user)
    if payload.action == "provide_info":
        if application["status"] != "INFO_REQUESTED":
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="This application is not waiting for information.")
        if not payload.message:
            raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Provide a response to the officer's information request.")
        target_status, reason = "UNDER_REVIEW", payload.message
    elif payload.action == "accept_counter_offer":
        target_status, reason = "ACCEPTED", "Applicant accepted the counter-offer."
    else:
        target_status, reason = "WITHDRAWN", "Applicant declined the counter-offer."
    updated = transition_application(
        application, target_status, current_user, reason, "applicant_response",
        {"message": payload.message, "applicant_action": payload.action},
    )
    get_database().reviews.insert_one({
        "application_id": application_id, "officer_id": None,
        "action": payload.action,
        "reason": "Applicant provided requested information." if payload.action == "provide_info" else reason,
        "created_at": datetime.now(UTC),
    })
    return updated


@app.post("/api/applications/{application_id}/withdraw")
def withdraw_application(
    application_id: str,
    payload: WithdrawalRequest,
    current_user: Annotated[CurrentUser, Depends(require_role("applicant"))],
):
    application = get_application(application_id)
    check_application_access(application, current_user)
    return transition_application(
        application, "WITHDRAWN", current_user, payload.reason or "Applicant withdrew the application.",
        "application_withdrawn",
    )


@app.get("/api/applications/{application_id}/report.pdf")
def application_report(
    application_id: str,
    current_user: Annotated[CurrentUser, Depends(get_current_user)],
):
    application = get_application(application_id)
    check_application_access(application, current_user)
    font_name = register_report_font()
    result = application["result"]
    applicant = get_database().users.find_one({"_id": ObjectId(application["applicant_id"])})
    buffer = BytesIO()
    styles = getSampleStyleSheet()
    title_style = ParagraphStyle(
        "ReportTitle", parent=styles["Title"], fontName=font_name, fontSize=20,
        leading=25, textColor=colors.HexColor("#0f3f53"), alignment=TA_CENTER,
    )
    heading_style = ParagraphStyle(
        "ReportHeading", parent=styles["Heading2"], fontName=font_name,
        fontSize=12, leading=16, textColor=colors.HexColor("#0f3f53"),
    )
    body_style = ParagraphStyle(
        "ReportBody", parent=styles["BodyText"], fontName=font_name,
        fontSize=9, leading=13, spaceAfter=4,
    )
    cell_style = ParagraphStyle("ReportCell", parent=body_style, spaceAfter=0)

    def paragraph(value: Any, style: ParagraphStyle = body_style) -> Paragraph:
        return Paragraph(escape(str(value)), style)

    story = [
        paragraph("CrediAdapt AI", title_style),
        paragraph("Loan assessment report", heading_style),
        paragraph(f"Reference: {application['reference']}"),
        paragraph(f"Generated: {datetime.now(UTC).strftime('%d %B %Y, %H:%M UTC')}"),
        paragraph(f"Applicant: {applicant.get('full_name', 'Applicant') if applicant else 'Applicant'}"),
        Spacer(1, 10),
        paragraph("Loan and affordability", heading_style),
    ]
    financial_rows = [
        [paragraph("Measure", cell_style), paragraph("Value", cell_style)],
        [paragraph("Requested loan", cell_style), paragraph(inr_indian(result["requested"]["loan_amount"]), cell_style)],
        [paragraph("Recommended loan", cell_style), paragraph(inr_indian(result["recommended_loan"]), cell_style)],
        [paragraph("Requested / recommended tenure", cell_style), paragraph(
            f"{result['requested']['tenure_months']} / {result['recommended_tenure']} months", cell_style
        )],
        [paragraph("Interest rate", cell_style), paragraph(f"{result['interest_rate']:.2f}%", cell_style)],
        [paragraph("Monthly EMI", cell_style), paragraph(inr_indian(result["emi"]), cell_style)],
        [paragraph("Total interest", cell_style), paragraph(inr_indian(result["simulation"]["total_interest"]), cell_style)],
        [paragraph("FOIR / maximum", cell_style), paragraph(
            f"{result['final_foir'] * 100:.2f}% / {result['max_foir'] * 100:.0f}%", cell_style
        )],
    ]
    table = Table(financial_rows, colWidths=[260, 230], repeatRows=1)
    table.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#eaf3f6")),
        ("TEXTCOLOR", (0, 0), (-1, 0), colors.HexColor("#0f3f53")),
        ("GRID", (0, 0), (-1, -1), 0.35, colors.HexColor("#d5e0e5")),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("LEFTPADDING", (0, 0), (-1, -1), 8),
        ("RIGHTPADDING", (0, 0), (-1, -1), 8),
        ("TOPPADDING", (0, 0), (-1, -1), 6),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
    ]))
    story.extend([table, Spacer(1, 10), paragraph("Risk assessment", heading_style)])
    risk = result.get("risk", {})
    story.append(paragraph(
        f"Risk band: {risk.get('risk_band', 'Not evaluated')} · "
        f"Modelled default probability: {risk.get('default_probability', 0) * 100:.2f}%"
    ))
    factors = risk.get("shap_factors", [])
    story.append(paragraph(
        "Main model factors: " + (
            ", ".join(f"{factor.get('label', factor.get('feature', 'Factor'))} "
                      f"({factor.get('direction', 'impact').replace('_', ' ')})" for factor in factors)
            if factors else "No factors available."
        )
    ))
    story.append(paragraph("Applied policies and concessions", heading_style))
    policies = result.get("policies", [])
    story.append(paragraph(
        "; ".join(
            f"{item.get('policy_name', 'Policy')} ({item.get('discount_percentage', 0)}%): "
            f"{item.get('justification', '')}" for item in policies
        ) if policies else "No policy concessions were applied."
    ))
    story.append(paragraph("Application status and review notes", heading_style))
    story.append(paragraph(f"Current status: {application['status'].replace('_', ' ')}"))
    history = application.get("status_history", [])
    story.extend(
        paragraph(
            f"{entry.get('to', 'Update').replace('_', ' ')}: {entry.get('reason', '')}"
        )
        for entry in history
        if entry.get("role") == "officer" and entry.get("reason")
    )
    story.append(paragraph("Early closure estimate", heading_style))
    simulation = result["simulation"]
    story.append(paragraph(
        f"At month {simulation.get('closure_month', 0)}, estimated outstanding principal is "
        f"{inr_indian(simulation.get('outstanding_principal', 0))}; estimated interest saved is "
        f"{inr_indian(simulation.get('interest_saved', 0))}."
    ))
    story.append(paragraph("AI assessment summary", heading_style))
    story.append(paragraph(result.get("explanation", {}).get("executive_summary", "")))
    story.append(Spacer(1, 8))
    story.append(paragraph(
        "Disclaimer: Figures are indicative, based on self-reported information, and are not a loan approval or offer. "
        f"Model version: {result.get('model_version', MODEL_VERSION)}."
    ))
    SimpleDocTemplate(
        buffer, pagesize=A4, rightMargin=48, leftMargin=48, topMargin=42, bottomMargin=42,
        title=f"CrediAdapt report {application['reference']}",
        author="CrediAdapt AI",
    ).build(story)
    audit("application_report_downloaded", application_id, current_user, {"reference": application["reference"]})
    buffer.seek(0)
    return StreamingResponse(
        buffer,
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{application["reference"]}-report.pdf"'},
    )


@app.get("/api/audit")
def get_audit_logs(
    current_user: Annotated[CurrentUser, Depends(require_role("officer"))],
    application_id: str | None = None,
    page: int = Query(default=1, ge=1),
    limit: int = Query(default=50, ge=1, le=100),
):
    query = {"application_id": application_id} if application_id else {}
    documents = list(get_database().audit_logs.find(query).sort("timestamp", -1))
    start = (page - 1) * limit
    return {
        "items": [
            {key: (str(value) if isinstance(value, ObjectId) else value) for key, value in item.items()}
            for item in documents[start:start + limit]
        ],
        "page": page,
        "limit": limit,
        "total": len(documents),
    }


@app.get("/api/notifications")
def get_notifications(
    current_user: Annotated[CurrentUser, Depends(get_current_user)],
    limit: int = Query(default=50, ge=1, le=100),
):
    documents = list(
        get_database().notifications.find({"user_id": current_user.id}).sort("created_at", -1)
    )[:limit]
    return {"items": [serialize_application(item) for item in documents]}


@app.post("/api/notifications/{notification_id}/read")
def mark_notification_read(
    notification_id: str,
    current_user: Annotated[CurrentUser, Depends(get_current_user)],
):
    if not ObjectId.is_valid(notification_id):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Notification not found.")
    updated = get_database().notifications.update_one(
        {"_id": ObjectId(notification_id), "user_id": current_user.id},
        {"$set": {"read": True}},
    )
    if updated.matched_count != 1:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Notification not found.")
    return {"success": True}


@app.get("/api/explainability/{application_id}")
def explainability(application_id: str, current_user: Annotated[CurrentUser, Depends(get_current_user)]):
    application = get_application(application_id)
    check_application_access(application, current_user)
    return {"application_id": application_id, "reference": application["reference"], "risk": application["result"]["risk"], "explanation": application["result"]["explanation"]}


@app.get("/api/advisor/{application_id}")
def advisor(application_id: str, current_user: Annotated[CurrentUser, Depends(get_current_user)]):
    application = get_application(application_id)
    check_application_access(application, current_user)
    return {"application_id": application_id, "reference": application["reference"], "advisor": application["result"]["explanation"]}


@app.get("/api/model/metrics")
def model_metrics(current_user: Annotated[CurrentUser, Depends(require_role("officer"))]):
    _, _, risk_engine, _, _, _ = get_agents()
    if risk_engine is None:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail="Risk model metrics are unavailable.")
    return {
        "model_version": MODEL_VERSION,
        "roc_auc": risk_engine.metrics["roc_auc"],
        "test_samples": risk_engine.metrics["test_samples"],
        "features": risk_engine.features,
    }


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=int(os.getenv("PORT", "8000")))
