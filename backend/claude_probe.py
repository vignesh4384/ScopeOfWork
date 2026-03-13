import asyncio
import json
import sys
from pathlib import Path

# Ensure backend package is on sys.path
BASE_DIR = Path(__file__).resolve().parent
PARENT = BASE_DIR.parent
if str(PARENT) not in sys.path:
    sys.path.insert(0, str(PARENT))

from backend.llm_providers.factory import get_provider

DESC = "Gas injection Turbine"

PROMPT = (
    "You are a purchasing assistant. Given a material description, propose parameters needed to buy it. "
    "Reply ONLY with JSON in this shape: "
    '{ \"mandatory_parameters\": [{\"name\":..., \"input_type\":\"text|number|select|date\", \"description\":..., \"example\":..., \"required\":true, \"options\":[...] }], '
    "\"optional_parameters\": [...], \"manufacturers\": [\"...\"], \"price_range\": \"...\", \"image_urls\": [\"...\"], \"references\": [\"...\"] } "
    "Keep 5-10 mandatory fields max; include technical, sizing, compliance, brand, and delivery aspects relevant to the item."
)


async def main():
    prov = get_provider()
    print("enabled:", prov.enabled, "model:", getattr(prov, "model", None))
    messages = [{"role": "system", "content": PROMPT}, {"role": "user", "content": DESC}]
    try:
        raw = await asyncio.wait_for(prov.generate(messages), timeout=15)
        print("RAW:\n", raw)
        try:
            data = json.loads(raw)
            print("\nParsed keys:", list(data.keys()))
        except Exception as e:
            print("JSON parse failed:", e)
    except Exception as e:
        print("ERROR:", e)


if __name__ == "__main__":
    asyncio.run(main())
