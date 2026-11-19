"""Phase 1 contract tests using an in-memory MongoDB-shaped test double.

Run after installing ``backend/requirements.txt``:
    python -m unittest discover -s backend/tests -v
"""

from __future__ import annotations

import os
import sys
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch

from bson import ObjectId
from fastapi.testclient import TestClient

BACKEND_DIR = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND_DIR))
os.environ.setdefault("JWT_SECRET", "test-access-secret-that-is-at-least-32-bytes")
os.environ.setdefault("JWT_REFRESH_SECRET", "test-refresh-secret-that-is-at-least-32-bytes")

import api
import auth


class InsertResult:
    def __init__(self, inserted_id: ObjectId):
        self.inserted_id = inserted_id


class UpdateResult:
    def __init__(self, matched_count: int):
        self.matched_count = matched_count


class Cursor(list):
    def sort(self, _field: str, _direction: int):
        return self


class Collection:
    def __init__(self, unique_email: bool = False):
        self.documents: list[dict] = []
        self.unique_email = unique_email

    def create_index(self, *_args, **_kwargs):
        return "test-index"

    def insert_one(self, document: dict) -> InsertResult:
        if self.unique_email and any(item.get("email") == document.get("email") for item in self.documents):
            from pymongo.errors import DuplicateKeyError

            raise DuplicateKeyError("duplicate email")
        stored = dict(document)
        stored.setdefault("_id", ObjectId())
        self.documents.append(stored)
        return InsertResult(stored["_id"])

    def find_one(self, query: dict):
        for document in self.documents:
            if all(document.get(key) == value for key, value in query.items()):
                return document
        return None

    def find(self, query: dict):
        return Cursor([item for item in self.documents if all(item.get(key) == value for key, value in query.items())])

    def update_one(self, query: dict, update: dict) -> UpdateResult:
        document = next((item for item in self.documents if all(item.get(key) == value for key, value in query.items())), None)
        if not document:
            return UpdateResult(0)
        document.update(update.get("$set", {}))
        for key, value in update.get("$push", {}).items():
            document.setdefault(key, []).append(value)
        return UpdateResult(1)


class Database:
    def __init__(self):
        self.users = Collection(unique_email=True)
        self.applications = Collection()
        self.audit_logs = Collection()
        self.counters = Collection()
        self.reviews = Collection()
        self.notifications = Collection()


class PhaseOneApiTests(unittest.TestCase):
    def setUp(self):
        self.database = Database()
        self.patches = [
            patch.object(api, "get_database", return_value=self.database),
            patch.object(auth, "get_database", return_value=self.database),
            patch.object(api, "ensure_indexes"),
            patch.object(api, "close_database"),
        ]
        for mocked in self.patches:
            mocked.start()
        self.client_context = TestClient(api.app)
        self.client = self.client_context.__enter__()

    def tearDown(self):
        self.client_context.__exit__(None, None, None)
        for mocked in reversed(self.patches):
            mocked.stop()

    def register(self, email: str = "applicant@example.com"):
        return self.client.post(
            "/api/auth/register",
            json={"email": email, "password": "correct-horse", "full_name": "Test Applicant"},
        )

    def test_applicant_registration_and_authenticated_application_list(self):
        response = self.register()
        self.assertEqual(response.status_code, 201)
        payload = response.json()
        self.assertEqual(payload["user"]["role"], "applicant")
        self.assertIn("crediadapt_refresh", response.headers.get("set-cookie", ""))

        applications = self.client.get(
            "/api/applications",
            headers={"Authorization": f"Bearer {payload['access_token']}"},
        )
        self.assertEqual(applications.status_code, 200)
        self.assertEqual(applications.json(), {"items": []})

    def test_protected_endpoint_rejects_missing_token(self):
        response = self.client.get("/api/applications")
        self.assertEqual(response.status_code, 401)

    def test_applicant_cannot_open_officer_queue(self):
        registration = self.register("queue-applicant@example.com").json()
        response = self.client.get(
            "/api/officer/queue",
            headers={"Authorization": f"Bearer {registration['access_token']}"},
        )
        self.assertEqual(response.status_code, 403)

    def test_login_rejects_role_mismatch(self):
        self.database.users.insert_one(
            {
                "email": "officer@example.com",
                "password_hash": auth.hash_password("correct-horse"),
                "full_name": "Test Officer",
                "role": "officer",
                "is_active": True,
            }
        )
        response = self.client.post(
            "/api/auth/login",
            json={"email": "officer@example.com", "password": "correct-horse", "role": "applicant"},
        )
        self.assertEqual(response.status_code, 403)

    def create_officer(self) -> str:
        self.database.users.insert_one({
            "email": "officer@example.com",
            "password_hash": auth.hash_password("correct-horse"),
            "full_name": "Test Officer",
            "role": "officer",
            "is_active": True,
        })
        response = self.client.post(
            "/api/auth/login",
            json={"email": "officer@example.com", "password": "correct-horse", "role": "officer"},
        )
        return response.json()["access_token"]

    def create_application(self, applicant_id: str, status: str = "SUBMITTED") -> str:
        document = {
            "reference": "CA-2026-000001",
            "applicant_id": applicant_id,
            "input": {
                "requested_loan": 100000, "requested_tenure": 24,
                "monthly_income": 50000, "age": 30, "gender": "Other",
                "house_rent": 5000, "existing_emi": 2000, "cibil_score": 750,
                "early_closure_month": 12,
            },
            "result": {
                "decision_type": "APPROVED_AS_REQUESTED",
                "requested": {"loan_amount": 100000, "tenure_months": 24},
                "recommended_loan": 100000, "recommended_tenure": 24,
                "interest_rate": 11.5, "emi": 5000, "final_foir": 0.24,
                "max_foir": 0.6, "risk": {"risk_band": "LOW", "default_probability": 0.1, "shap_factors": []},
                "policies": [],
                "simulation": {
                    "total_interest": 2000, "total_cost": 102000, "closure_month": 12,
                    "outstanding_principal": 50000, "interest_saved": 500,
                    "total_repaid_with_closure": 70000,
                },
                "explanation": {"executive_summary": "An assessment summary."},
            },
            "status": status,
            "status_history": [],
            "created_at": api.datetime.now(api.UTC),
            "updated_at": api.datetime.now(api.UTC),
        }
        return str(self.database.applications.insert_one(document).inserted_id)

    def test_officer_review_decision_audits_and_notifies_applicant(self):
        applicant = self.register().json()
        application_id = self.create_application(applicant["user"]["id"])
        officer_token = self.create_officer()
        headers = {"Authorization": f"Bearer {officer_token}"}

        started = self.client.post(
            f"/api/officer/applications/{application_id}/start-review",
            headers=headers,
        )
        self.assertEqual(started.status_code, 200)
        self.assertEqual(started.json()["status"], "UNDER_REVIEW")

        decision = self.client.post(
            f"/api/officer/applications/{application_id}/decision",
            headers=headers,
            json={"action": "reject", "reason": "The officer reviewed the application."},
        )
        self.assertEqual(decision.status_code, 200)
        self.assertEqual(decision.json()["status"], "REJECTED")
        self.assertEqual(len(decision.json()["status_history"]), 2)
        self.assertEqual(len(self.database.audit_logs.documents), 4)
        self.assertEqual(len(self.database.notifications.documents), 2)
        self.assertEqual(len(self.database.reviews.documents), 2)

    def test_illegal_transition_returns_conflict_and_no_notification(self):
        applicant = self.register().json()
        application_id = self.create_application(applicant["user"]["id"])
        response = self.client.post(
            f"/api/applications/{application_id}/respond",
            headers={"Authorization": f"Bearer {applicant['access_token']}"},
            json={"action": "accept_counter_offer"},
        )
        self.assertEqual(response.status_code, 409)
        self.assertEqual(self.database.notifications.documents, [])

    def test_applicant_cannot_respond_to_another_applicants_application(self):
        first = self.register().json()
        second = self.register("other@example.com").json()
        application_id = self.create_application(first["user"]["id"], "INFO_REQUESTED")
        response = self.client.post(
            f"/api/applications/{application_id}/respond",
            headers={"Authorization": f"Bearer {second['access_token']}"},
            json={"action": "provide_info", "message": "Here is the requested information."},
        )
        self.assertEqual(response.status_code, 403)

    def test_owner_can_download_pdf_but_another_applicant_cannot(self):
        first = self.register().json()
        second = self.register("other@example.com").json()
        application_id = self.create_application(first["user"]["id"])

        forbidden = self.client.get(
            f"/api/applications/{application_id}/report.pdf",
            headers={"Authorization": f"Bearer {second['access_token']}"},
        )
        self.assertEqual(forbidden.status_code, 403)

        response = self.client.get(
            f"/api/applications/{application_id}/report.pdf",
            headers={"Authorization": f"Bearer {first['access_token']}"},
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.headers["content-type"], "application/pdf")
        self.assertTrue(response.content.startswith(b"%PDF"))

    def test_information_response_counter_offer_and_acceptance_flow(self):
        applicant = self.register().json()
        officer_token = self.create_officer()
        officer = self.database.users.find_one({"email": "officer@example.com"})
        application_id = self.create_application(applicant["user"]["id"], "INFO_REQUESTED")
        application = self.database.applications.find_one({"_id": ObjectId(application_id)})
        application["assigned_officer_id"] = str(officer["_id"])

        response = self.client.post(
            f"/api/applications/{application_id}/respond",
            headers={"Authorization": f"Bearer {applicant['access_token']}"},
            json={"action": "provide_info", "message": "Income documents are attached."},
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["status"], "UNDER_REVIEW")

        decision = self.client.post(
            f"/api/officer/applications/{application_id}/decision",
            headers={"Authorization": f"Bearer {officer_token}"},
            json={
                "action": "counter_offer",
                "reason": "The requested amount exceeds the current affordability estimate.",
                "counter_offer": {"amount": 80000, "tenure_months": 24, "interest_rate": 10.5},
            },
        )
        self.assertEqual(decision.status_code, 200)
        self.assertEqual(decision.json()["status"], "COUNTER_OFFERED")
        self.assertEqual(decision.json()["counter_offer"]["amount"], 80000)

        acceptance = self.client.post(
            f"/api/applications/{application_id}/respond",
            headers={"Authorization": f"Bearer {applicant['access_token']}"},
            json={"action": "accept_counter_offer"},
        )
        self.assertEqual(acceptance.status_code, 200)
        self.assertEqual(acceptance.json()["status"], "ACCEPTED")
        self.assertEqual(
            [entry["to"] for entry in acceptance.json()["status_history"]],
            ["UNDER_REVIEW", "COUNTER_OFFERED", "ACCEPTED"],
        )
        self.assertTrue(all("message" not in entry["details"] for entry in self.database.audit_logs.documents))
        info_response = self.database.reviews.find_one({"action": "provide_info"})
        self.assertEqual(info_response["reason"], "Applicant provided requested information.")

    def test_secure_refresh_cookie_uses_cross_site_compatible_attributes(self):
        with patch.dict(os.environ, {"COOKIE_SECURE": "true"}):
            response = self.register()
        cookie = response.headers.get("set-cookie", "").lower()
        self.assertIn("secure", cookie)
        self.assertIn("samesite=none", cookie)

    def test_model_metrics_are_limited_to_officers(self):
        applicant = self.register().json()
        forbidden = self.client.get(
            "/api/model/metrics",
            headers={"Authorization": f"Bearer {applicant['access_token']}"},
        )
        self.assertEqual(forbidden.status_code, 403)

        officer_token = self.create_officer()
        risk = SimpleNamespace(metrics={"roc_auc": 0.81, "test_samples": 100}, features=["cibil_score"])
        with patch.object(api, "get_agents", return_value=(None, None, risk, None, None, None)):
            response = self.client.get(
                "/api/model/metrics",
                headers={"Authorization": f"Bearer {officer_token}"},
            )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["roc_auc"], 0.81)

    def test_officer_analytics_reports_approval_rate_by_risk_band(self):
        applicant = self.register().json()
        self.create_application(applicant["user"]["id"], "APPROVED")
        self.create_application(applicant["user"]["id"], "REJECTED")
        officer_token = self.create_officer()
        response = self.client.get(
            "/api/officer/analytics",
            headers={"Authorization": f"Bearer {officer_token}"},
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["approval_rate_by_risk"]["LOW"], 0.5)

    def test_preflight_allows_configured_local_frontend_origin(self):
        response = self.client.options(
            "/api/auth/register",
            headers={
                "Origin": "http://localhost:3000",
                "Access-Control-Request-Method": "POST",
                "Access-Control-Request-Headers": "content-type",
            },
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(
            response.headers["access-control-allow-origin"],
            "http://localhost:3000",
        )


if __name__ == "__main__":
    unittest.main()
