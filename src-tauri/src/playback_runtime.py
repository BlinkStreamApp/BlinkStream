"""Fixed internal helper. Never invoke with credentials in argv."""
import sys
import os
import json
import logging
import pathlib

# Retain only the anonymous pipe for protocol output, silence libraries and errors.
output = os.fdopen(os.dup(sys.stdout.fileno()), 'w', encoding='utf-8')
null = os.open(os.devnull, os.O_WRONLY)
os.dup2(null, 1)
os.dup2(null, 2)
os.close(null)
logging.disable(logging.CRITICAL)
os.environ['APPDATA'] = str(pathlib.Path(sys.executable).parent)
sys.path.insert(0, str(pathlib.Path(sys.executable).resolve().parents[1] / 'pkgs'))

def main():
    raw = sys.stdin.buffer.read(4097)
    if len(raw) > 4096:
        raise ValueError()
    request = json.loads(raw)
    token = request['token']
    login = request['login']
    quality = request['quality']
    canary = request['canary']
    if not isinstance(token, str) or not 1 <= len(token) <= 512 or not token.isascii() or not token.isalnum():
        raise ValueError()
    if not isinstance(login, str) or not 1 <= len(login) <= 25 or not login.isascii() or not all(c.isalnum() or c == '_' for c in login):
        raise ValueError()
    if quality is not None and (not isinstance(quality, str) or not 1 <= len(quality) <= 32 or not quality.isascii() or not all(c.isalnum() or c == '_' for c in quality)):
        raise ValueError()
    if canary:
        if token != 'FAKE_CANARY_ONLY'.replace('_', '') or login != 'canary' or quality is not None:
            raise ValueError()
        def audit(event, args):
            if event in ('socket.connect', 'socket.getaddrinfo', 'socket.bind', 'subprocess.Popen'):
                raise RuntimeError()
        sys.addaudithook(audit)
    from streamlink import Streamlink, __version__
    from streamlink.plugins.twitch import Twitch
    from streamlink.options import Options
    session = Streamlink()
    session.set_option('no-plugin-cache', True)
    plugin = Twitch(session, 'https://www.twitch.tv/' + login,
                    options=Options({'api-header': [('Authorization', 'OAuth ' + token)],
                                     'supported-codecs': ['h264', 'h265', 'av1']}))
    if __version__ != '8.6.3':
        raise ValueError()
    if canary:
        assert plugin.api.headers['Authorization'] == 'OAuth ' + token
        assert plugin.api.headers['Client-ID'] == plugin.api.CLIENT_ID
        import socket
        try:
            socket.create_connection(('127.0.0.1', 1))
        except RuntimeError:
            pass
        else:
            raise ValueError()
        result = {'variants': ['720p'], 'url': None}
    else:
        streams = plugin.streams()
        result = {'variants': sorted(streams), 'url': streams[quality].to_url() if quality is not None else None}
    encoded = json.dumps(result, separators=(',', ':'))
    if token in encoded or len(encoded.encode('utf-8')) > 65536:
        raise ValueError()
    output.write(encoded)
    output.flush()

try:
    main()
except BaseException:
    sys.exit(1)
