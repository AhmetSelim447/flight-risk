import os
import unittest

from services.nlp.main import (
    NotamIn,
    NotamOut,
    ParseRequest,
    RiskPredictRequest,
    parse_notams,
    risk_predict,
)


class AiServiceFallbackTests(unittest.TestCase):
    def setUp(self):
        self.old_llm_enabled = os.environ.get("LLM_ENABLED")
        self.old_openai_key = os.environ.get("OPENAI_API_KEY")
        os.environ["LLM_ENABLED"] = "false"
        os.environ.pop("OPENAI_API_KEY", None)

    def tearDown(self):
        if self.old_llm_enabled is None:
            os.environ.pop("LLM_ENABLED", None)
        else:
            os.environ["LLM_ENABLED"] = self.old_llm_enabled
        if self.old_openai_key is None:
            os.environ.pop("OPENAI_API_KEY", None)
        else:
            os.environ["OPENAI_API_KEY"] = self.old_openai_key

    def test_notam_parse_falls_back_without_llm_key(self):
        response = parse_notams(
            ParseRequest(
                items=[
                    NotamIn(
                        raw="LTAC RWY 03L/21R CLSD DUE WIP",
                        critical=True,
                    )
                ]
            )
        )

        self.assertEqual(len(response), 1)
        self.assertEqual(response[0].severity, "Critical")
        self.assertIn("runway", response[0].impacts)
        self.assertGreaterEqual(response[0].score, 45)

    def test_risk_predict_uses_structured_notam_analysis(self):
        parsed_notam = NotamOut(
            raw="LTAC RWY 03L/21R CLSD",
            severity="Critical",
            impacts=["runway"],
            summary="Pist kapali.",
            operationalImpact="Inis plani ve alternate kontrol edilmeli.",
            score=86,
        )

        response = risk_predict(
            RiskPredictRequest(
                ruleScore=0,
                notamAnalysis={"arr": [parsed_notam]},
                confidence={"level": "high", "score": 95, "factors": []},
            )
        )

        self.assertGreaterEqual(response.notamSemanticScore, 75)
        self.assertTrue(any("NOTAM" in driver for driver in response.drivers))


if __name__ == "__main__":
    unittest.main()
