import asyncio
import json
from backend.llm_providers.factory import get_provider


async def main():
    prov = get_provider()
    print("enabled", prov.enabled, "model", getattr(prov, "model", None))
    desc = "Gas injection Turbine"
    prompt = (
        "You are a purchasing assistant. Given a material description, propose parameters needed to buy it. "
        "Reply ONLY with JSON in this shape: "
        '{ "mandatory_parameters": [{"name":..., "input_type":"text|number|select|date", "description":..., "example":..., "required":true, "options":[...] }], '
        '"optional_parameters": [...], "manufacturers": ["..."], "price_range": "...", "image_urls": ["..."], "references": ["..."] } '
        "Keep 5-10 mandatory fields max; include technical, sizing, compliance, brand, and delivery aspects relevant to the item."
    )
    messages = [{"role": "system", "content": prompt}, {"role": "user", "content": desc}]
    try:
        raw = await asyncio.wait_for(prov.generate(messages), timeout=15)
        print("RAW:\n", raw)
        try:
            data = json.loads(raw)
            print("\nParsed keys:", list(data.keys()))
        except Exception as e:
            print("JSON parse failed:", e)
    except Exception as e:
        print("ERROR", e)


asyncio.run(main())
