from io import BytesIO
import unittest

from openpyxl import load_workbook

from engine import analyze_job, rank_candidates
from spreadsheet import create_candidate_workbook


class TalentEngineTests(unittest.TestCase):
    def setUp(self):
        self.job = {
            "title": "Analista de Administração de Pessoal",
            "city": "São Paulo",
            "additionalCity": "",
            "description": "Responsável por folha de pagamento, admissão, rescisão, Excel e legislação trabalhista.",
            "keywords": ["folha de pagamento", "Excel"],
            "nationwide": True,
        }

    def test_expands_titles_in_three_languages(self):
        intelligence = analyze_job(self.job)
        normalized = " | ".join(intelligence.equivalent_titles).lower()
        self.assertIn("payroll analyst", normalized)
        self.assertIn("analista de nómina", normalized)
        self.assertIn("analista de departamento pessoal", normalized)

    def test_multilingual_equivalent_outranks_unrelated_profile(self):
        candidates = [
            {
                "id": "1", "name": "Ana", "title": "Payroll Analyst", "summary": "Payroll, Excel and labor law",
                "city": "São Paulo", "state": "SP", "profileUrl": "https://www.linkedin.com/in/ana",
            },
            {
                "id": "2", "name": "Bruno", "title": "Marketing Analyst", "summary": "Digital campaigns and branding",
                "city": "São Paulo", "state": "SP", "profileUrl": "https://www.linkedin.com/in/bruno",
            },
        ]
        _, ranked = rank_candidates(self.job, candidates)
        self.assertEqual("Ana", ranked[0]["name"])
        self.assertEqual(1, len(ranked))
        self.assertEqual("Python 3 · motor multilíngue", ranked[0]["rankingEngine"])

    def test_process_standardization_expands_titles_in_three_languages(self):
        job = {
            **self.job,
            "title": "Gerente de Padronização de Processos",
            "description": "Gestão, governança e padronização de processos industriais.",
            "keywords": ["Couro", "Curtume"],
        }
        intelligence = analyze_job(job)
        normalized = " | ".join(intelligence.equivalent_titles).lower()
        self.assertEqual("process_excellence", intelligence.family)
        self.assertIn("process standardization manager", normalized)
        self.assertIn("gerente de estandarización de procesos", normalized)
        self.assertEqual(["Couro / Leather", "Curtume / Tannery"], [
            concept.label for concept in intelligence.required_keywords
        ])

    def test_required_keywords_remove_profiles_without_public_evidence(self):
        job = {
            **self.job,
            "title": "Gerente de Padronização de Processos",
            "description": "Padronização, melhoria contínua e processos industriais.",
            "keywords": ["Couro", "Curtume"],
        }
        candidates = [
            {
                "id": "1", "name": "Ana", "title": "Process Standardization Manager",
                "summary": "Process governance and operational excellence in the leather and tannery industry",
                "city": "Franca", "state": "SP", "profileUrl": "https://www.linkedin.com/in/ana",
            },
            {
                "id": "2", "name": "Bruno", "title": "Gerente de Processos",
                "summary": "Padronização de processos no setor bancário",
                "city": "São Paulo", "state": "SP", "profileUrl": "https://www.linkedin.com/in/bruno",
            },
            {
                "id": "3", "name": "Carlos", "title": "Gerente de Procesos",
                "summary": "Excelencia operacional en curtiembre y curtido de cuero",
                "city": "Buenos Aires", "state": "", "profileUrl": "https://www.linkedin.com/in/carlos",
            },
            {
                "id": "4", "name": "Diana", "title": "Continuous Improvement Manager",
                "summary": "Lean transformation and process governance for tannery operations",
                "city": "Franca", "state": "SP", "profileUrl": "https://www.linkedin.com/in/diana",
            },
            {
                "id": "5", "name": "Eduardo", "title": "Gerente Comercial",
                "summary": "Vendas de artigos de couro no varejo",
                "city": "São Paulo", "state": "SP", "profileUrl": "https://www.linkedin.com/in/eduardo",
            },
        ]
        _, ranked = rank_candidates(job, candidates)
        self.assertEqual(["Ana", "Carlos", "Diana"], sorted(candidate["name"] for candidate in ranked))
        self.assertTrue(all(not candidate["missingRequiredKeywords"] for candidate in ranked))
        self.assertTrue(all(len(candidate["matchedRequiredKeywords"]) == 2 for candidate in ranked))

    def test_composite_keyword_field_becomes_two_required_concepts(self):
        job = {**self.job, "keywords": ["Couro e Curtume"]}
        intelligence = analyze_job(job)
        self.assertEqual(["Couro / Leather", "Curtume / Tannery"], [
            concept.label for concept in intelligence.required_keywords
        ])

    def test_sensitive_traits_never_become_ranking_skills(self):
        job = {**self.job, "keywords": ["Excel", "idade", "PcD", "gênero"]}
        intelligence = analyze_job(job)
        normalized_skills = " ".join(intelligence.skills).lower()
        self.assertIn("excel", normalized_skills)
        self.assertNotIn("idade", normalized_skills)
        self.assertNotIn("pcd", normalized_skills)
        self.assertNotIn("gênero", normalized_skills)

    def test_export_creates_real_xlsx_with_hyperlink(self):
        _, ranked = rank_candidates(self.job, [{
            "id": "1", "name": "Ana", "title": "Payroll Analyst", "summary": "Payroll and Excel",
            "city": "São Paulo", "state": "SP", "profileUrl": "https://www.linkedin.com/in/ana",
        }])
        binary = create_candidate_workbook(self.job, ranked)
        workbook = load_workbook(BytesIO(binary))
        sheet = workbook["Candidatos"]
        self.assertEqual("Nome", sheet["D1"].value)
        self.assertEqual("Ana", sheet["D2"].value)
        self.assertEqual("https://www.linkedin.com/in/ana", sheet["L2"].hyperlink.target)

    def test_export_neutralizes_excel_formulas(self):
        _, ranked = rank_candidates(self.job, [{
            "id": "1", "name": "=HYPERLINK(\"bad\")", "title": "Payroll Analyst", "summary": "Payroll and Excel",
            "city": "São Paulo", "state": "SP", "profileUrl": "https://www.linkedin.com/in/safe",
        }])
        binary = create_candidate_workbook(self.job, ranked)
        workbook = load_workbook(BytesIO(binary), data_only=False)
        self.assertTrue(str(workbook["Candidatos"]["D2"].value).startswith("'="))


if __name__ == "__main__":
    unittest.main()
