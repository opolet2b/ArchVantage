
import base64
import httpx
import asyncio

api_key = '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'
wav_b64 = 'UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQAAAAA='

async def test():
    async with httpx.AsyncClient() as client:
        audio_data = base64.b64decode(wav_b64)
        files = {'file': ('test.wav', audio_data, 'audio/wav')}
        data = {'model': 'openai/whisper-large-v3'}
        res = await client.post('https://openrouter.ai/api/v1/audio/transcriptions', headers={'Authorization': f'Bearer {api_key}'}, data=data, files=files)
        print(res.status_code, res.text)

asyncio.run(test())
