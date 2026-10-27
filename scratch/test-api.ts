const API_URL = "http://localhost:8080/api/public/evaluate-loan";

const case1 = {
  monthly_income: 95000,
  age: 27,
  gender: "Female",
  house_rent: 18000,
  existing_emi: 8000,
  cibil_score: 795,
  requested_loan: 500000,
  requested_tenure: 36,
  early_closure_month: 18
};

const case2 = {
  monthly_income: 45000,
  age: 34,
  gender: "Male",
  house_rent: 16000,
  existing_emi: 9000,
  cibil_score: 670,
  requested_loan: 600000,
  requested_tenure: 36,
  early_closure_month: 18
};

const case3 = {
  monthly_income: 30000,
  age: 40,
  gender: "Male",
  house_rent: 15000,
  existing_emi: 10000,
  cibil_score: 600,
  requested_loan: 500000,
  requested_tenure: 36,
  early_closure_month: 12
};

const invalidCase = {
  monthly_income: -5000,
  age: 10,
  gender: "InvalidGender",
};

async function testApi() {
  console.log("=== API INTEGRATION TESTS ===");

  // Test 1: Approved
  console.log("\n[Test 1] Approved case:");
  const res1 = await fetch(API_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(case1),
  });
  const data1 = await res1.json();
  console.log("Status:", res1.status);
  console.log("Decision:", data1.decision_type);
  console.log("Is Eligible:", data1.is_eligible);
  console.log("EMI:", data1.emi);
  console.log("Risk band:", data1.risk?.risk_band);
  console.log("SHAP factors count:", data1.risk?.shap_factors?.length);
  console.log("Policies count:", data1.policies?.length);
  console.log("Simulation closure month:", data1.simulation?.closure_month);

  // Test 2: Counter-offer
  console.log("\n[Test 2] Counter-offer case:");
  const res2 = await fetch(API_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(case2),
  });
  const data2 = await res2.json();
  console.log("Status:", res2.status);
  console.log("Decision:", data2.decision_type);
  console.log("Recommended loan:", data2.recommended_loan);
  console.log("Recommended tenure:", data2.recommended_tenure);
  console.log("EMI:", data2.emi);

  // Test 3: Rejected
  console.log("\n[Test 3] Rejected case:");
  const res3 = await fetch(API_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(case3),
  });
  const data3 = await res3.json();
  console.log("Status:", res3.status);
  console.log("Decision:", data3.decision_type);
  console.log("Is Eligible:", data3.is_eligible);
  console.log("EMI:", data3.emi);
  console.log("Risk Evaluated:", data3.risk?.evaluated);

  // Test 4: Validation Error (422)
  console.log("\n[Test 4] Validation Error (422):");
  const res4 = await fetch(API_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(invalidCase),
  });
  const data4 = await res4.json();
  console.log("Status:", res4.status);
  console.log("Response:", JSON.stringify(data4));

  // Test 5: Malformed JSON (400)
  console.log("\n[Test 5] Malformed JSON (400):");
  const res5 = await fetch(API_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: "NOT_VALID_JSON{",
  });
  const data5 = await res5.json();
  console.log("Status:", res5.status);
  console.log("Response:", JSON.stringify(data5));
}

testApi().catch(console.error);
