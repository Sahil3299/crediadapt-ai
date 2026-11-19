import os
import sys
import unittest
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND_DIR))
os.environ.setdefault("JWT_SECRET", "test-access-secret-that-is-at-least-32-bytes")
os.environ.setdefault("JWT_REFRESH_SECRET", "test-refresh-secret-that-is-at-least-32-bytes")

import api


class ExplanationGuardTests(unittest.TestCase):
    def test_numeric_guard_accepts_exact_calculated_figures(self):
        explanation = {
            "executive_summary": "Recommended loan ₹1,00,000.00 at 11.50%.",
            "affordability_rationale": "Monthly EMI ₹4,668.00; FOIR is 40.00%.",
        }
        self.assertEqual(
            api.explanation_missing_figures(
                explanation, 100000, 11.5, 4668, 0.4, True, 100000, 0.4,
            ),
            [],
        )

    def test_numeric_guard_flags_a_mismatched_ai_figure(self):
        explanation = {
            "executive_summary": "Recommended loan ₹1,00,000 at 9.50%.",
            "affordability_rationale": "Monthly EMI ₹4,668; FOIR is 40.00%.",
        }
        self.assertEqual(
            api.explanation_missing_figures(
                explanation, 100000, 11.5, 4668, 0.4, True, 100000, 0.4,
            ),
            ["interest rate"],
        )

    def test_currency_normalizer_restores_rupee_symbol(self):
        normalized = api.normalize_narrative_currency({
            "summary": "Amount ?1,00,000 or INR 5000",
        })
        self.assertEqual(normalized["summary"], "Amount ₹1,00,000 or ₹5000")


if __name__ == "__main__":
    unittest.main()
