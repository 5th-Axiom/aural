"""Validate and normalize a dedicated test environment without printing secrets."""
import os
import re
import sys
from pathlib import Path
from urllib.parse import urlsplit

def validate(source: str) -> dict[str, str]:
    values = {}
    for line in source.splitlines():
        line = line.strip()
        if not line or line.startswith('#'):
            continue
        if '=' not in line:
            raise ValueError('Use KEY=value for every environment setting')
        key, value = line.split('=', 1)
        if not re.fullmatch(r'[A-Z][A-Z0-9_]*', key) or key in values:
            raise ValueError(f'Invalid or duplicate environment key: {key}')
        if value.startswith(('"', "'")) or '$' in value or '\x00' in value:
            raise ValueError(f'{key}: use literal values without quotes or dollar expansion')
        values[key] = value
    required = ['NEXT_PUBLIC_APP_URL', 'NEXT_PUBLIC_SUPABASE_URL', 'NEXT_PUBLIC_SUPABASE_ANON_KEY',
                'SUPABASE_URL', 'SUPABASE_ANON_KEY', 'SUPABASE_SERVICE_ROLE_KEY',
                'OPENAI_API_KEY', 'OPENAI_BASE_URL', 'OPENAI_MODEL', 'GENERATOR_MODEL', 'REPORT_MODEL',
                'RELAY_LLM_API_KEY', 'RELAY_LLM_MODEL', 'RELAY_LLM_BASE_URL']
    if values.get('RELAY_LLM_PROVIDER') != 'openai':
        raise ValueError('This deployment requires RELAY_LLM_PROVIDER=openai')
    asr = values.get('ASR_PROVIDER', 'volcengine')
    if asr not in ('dashscope', 'volcengine'):
        raise ValueError('ASR_PROVIDER must be dashscope or volcengine')
    required += ['DASHSCOPE_API_KEY' if asr == 'dashscope' else 'DOUBAO_API_KEY']
    tts = values.get('TTS_PROVIDER', 'volcengine')
    if tts not in ('tokendance', 'volcengine'):
        raise ValueError('TTS_PROVIDER must be tokendance or volcengine')
    if tts == 'tokendance':
        required += ['TOKENDANCE_API_KEY']
    elif not values.get('DOUBAO_API_KEY'):
        required += ['DOUBAO_APP_ID', 'DOUBAO_ACCESS_TOKEN']
    for key in required:
        if not values.get(key) or any(x in values[key].lower() for x in ('your-project', 'your-key', 'example.com')):
            raise ValueError(f'Missing test configuration: {key}')
    for key in ('NEXT_PUBLIC_APP_URL', 'NEXT_PUBLIC_SUPABASE_URL'):
        url = urlsplit(values[key])
        if url.scheme != 'https' or not url.hostname or url.hostname in ('localhost', '127.0.0.1', '::1'):
            raise ValueError(f'{key} must be an externally reachable HTTPS URL')
    if urlsplit(values['NEXT_PUBLIC_APP_URL']).path not in ('', '/'):
        raise ValueError('NEXT_PUBLIC_APP_URL must use a dedicated domain, without a subpath')
    for key in ('NEXT_PUBLIC_VOICE_RELAY_URL', 'NEXT_PUBLIC_OPENAI_VOICE_RELAY_URL'):
        if values.get(key):
            raise ValueError(f'Leave {key} empty to use the deployment gateway')
    values['NEXT_PUBLIC_VOICE_RELAY_PRIMARY'] = 'voice'
    values['NEXT_PUBLIC_VOICE_RELAY_URL'] = ''
    values['NEXT_PUBLIC_OPENAI_VOICE_RELAY_URL'] = ''
    return values

if __name__ == '__main__':
    try:
        result = validate(Path(sys.argv[1]).read_text())
        target = Path(sys.argv[2])
        target.write_text(''.join(f'{k}={v}\n' for k, v in result.items()))
        os.chmod(target, 0o600)
        print('Test environment configuration validated (credentials hidden).')
    except (ValueError, OSError) as error:
        sys.exit(str(error))
