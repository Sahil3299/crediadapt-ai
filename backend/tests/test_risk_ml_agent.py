from types import SimpleNamespace
import unittest

from backend.risk_ml_agent import RiskMLAgent


class RiskModelFairnessTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.agent = RiskMLAgent()
        cls.profile = {
            "monthly_income": 85000,
            "age": 34,
            "house_rent": 12000,
            "existing_emi": 6000,
            "cibil_score": 760,
        }

    def test_gender_is_not_a_model_feature_and_holdout_auc_is_reported(self):
        self.assertNotIn("gender", self.agent.features)
        self.assertNotIn("gender_encoded", self.agent.features)
        self.assertIsNotNone(self.agent.metrics["roc_auc"])
        self.assertGreater(self.agent.metrics["test_samples"], 0)

    def test_risk_prediction_does_not_change_with_gender(self):
        female = SimpleNamespace(gender="Female", **self.profile)
        male = SimpleNamespace(gender="Male", **self.profile)
        female_result = self.agent.evaluate_risk(female, loan_amt=250000, tenure=36, foir=0.4)
        male_result = self.agent.evaluate_risk(male, loan_amt=250000, tenure=36, foir=0.4)
        self.assertEqual(female_result["default_probability"], male_result["default_probability"])
        self.assertEqual(female_result["risk_band"], male_result["risk_band"])


if __name__ == "__main__":
    unittest.main()
