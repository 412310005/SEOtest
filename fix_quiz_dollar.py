# -*- coding: utf-8 -*-
"""Fix $-stripped strings and wrong explanation in study_data.json quiz sections."""
import json
from pathlib import Path

p = Path(r"c:\Users\evon9\OneDrive\桌面\風保\study_data.json")
data = json.loads(p.read_text(encoding="utf-8"))

# Chapter 2 - new expected loss question
for item in data["chapter_2"]["quiz"]:
    if item.get("type") == "calculation" and "One building is valued" in item.get("question", ""):
        item["question"] = (
            "One building is valued at $40,000. The annual probability of a total loss from fire is 5%. "
            "What is the expected loss for this single exposure? / "
            "某建築物價值 40,000 元，每年全損火災機率為 5%。請計算該單一曝險之期望損失。"
        )

# Chapter 3 - new total expected loss + fix explanation if wrong
for item in data["chapter_3"]["quiz"]:
    if item.get("type") == "calculation" and "800 identical exposure" in item.get("question", ""):
        item["question"] = (
            "A firm has 800 identical exposure units. Estimated loss frequency is 4% per year, "
            "and average loss severity when a loss occurs is $25,000. "
            "Compute the total expected loss amount for the year. / "
            "某公司共有 800 個相同曝險單位；估計年損失頻率 4%，每次事故之平均損失幅度為 25,000 元。"
            "請計算本年度總期望損失金額。"
        )
        item["explanation"] = (
            "800 × 0.04 × 25,000 = 800,000. / "
            "總期望損失＝800×0.04×25,000＝800,000 元。"
        )

# Chapter 6 - premium calculation
for item in data["chapter_6"]["quiz"]:
    if item.get("type") == "calculation" and "manual rate" in item.get("question", "").lower():
        item["question"] = (
            "The manual rate for a line of business is $180 per car-year. "
            "An insured fleet has 240 car-years of exposure for the policy period. "
            "Compute the premium using the chapter premium equation. / "
            "某險種費率為每「車年」180 元；一張保單期間共有 240 個車年暴露。"
            "請用保費＝費率×暴露單位數計算應收保費。"
        )

# Chapter 7 - loss ratio question + gross premium question + bilingual for ratio explanations
for item in data["chapter_7"]["quiz"]:
    q = item.get("question", "")
    if item.get("type") == "calculation" and "Incurred losses" in q:
        item["question"] = (
            "Incurred losses are $4,200,000, loss adjustment expenses are $300,000, "
            "and earned premiums are $6,000,000. Compute the loss ratio as a decimal (e.g., 0.75). / "
            "已發生損失 4,200,000 元，損失調整費用 300,000 元，已賺取保費 6,000,000 元。"
            "請計算損失率（以小數表示）。"
        )
    if item.get("type") == "calculation" and "gross rate" in q.lower() and "commercial building" in q.lower():
        item["question"] = (
            "The gross rate is $0.60 per $100 of property coverage. "
            "A commercial building carries $2,500,000 of coverage. "
            "How many exposure units (in hundreds of dollars) are there, and what is the gross premium? / "
            "毛費率為每 100 元保額 0.60 元；某建築物投保額為 2,500,000 元。"
            "請先換算曝險單位數（以「百元」為單位），再計算毛保費。"
        )
        item["formula"] = (
            "Gross Premium = Gross Rate × Number of exposure units (e.g., per $100 of coverage)"
        )
    if item.get("type") == "calculation" and "Loss ratio is 68%" in q:
        item["explanation"] = (
            "68% + 27% = 95%; below 100% indicates an underwriting profit. / "
            "68%＋27%＝95%；低於 100% 表示承保獲利。"
        )
    if item.get("type") == "calculation" and "Combined ratio is 102%" in q:
        item["explanation"] = (
            "102% − 4% = 98%. / 綜合經營率＝102%−4%＝98%。"
        )

# Chapter 1 first calculation - bilingual explanation for Philadelphia
for item in data["chapter_1"]["quiz"]:
    if item.get("type") == "calculation" and "Philadelphia and Los Angeles" in item.get("question", ""):
        item["explanation"] = (
            "Philadelphia has a wider loss range (75–125 vs. 90–110), so relative variation is larger; "
            "objective risk is higher (about 25% vs. 10%). / "
            "費城損失區間較寬（75–125 對 90–110），相對變異較大，故客觀風險較高（約 25% 對 10%）。"
        )
        item["formula"] = "Objective Risk = (Maximum deviation from expected loss) / (Expected loss)"

p.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")
print("Fixed.")
