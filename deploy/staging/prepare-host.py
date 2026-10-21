#!/usr/bin/env python3
"""Preparación como nano; no crea la base ni activa un release."""
import fcntl
import os
from pathlib import Path
import secrets
import socket

root = Path('/var/www/staging/amyb')
assert root.resolve() == root and (root / 'PROJECT_NAME').read_text().strip() == 'amyb'
assert os.geteuid() != 0, 'Ejecutar como nano, no root'
with socket.socket() as probe:
    probe.bind(('127.0.0.1', 4202))

registry = Path('/var/www/staging/.control/registry/ports.tsv')
with registry.open('r+') as target:
    fcntl.flock(target, fcntl.LOCK_EX)
    lines = target.read().splitlines()
    # Normaliza una reserva de preparación escrita con tabuladores escapados.
    lines = [line.replace('\\t', '\t') if line.startswith('amyb\\t') else line for line in lines]
    entries = [line.split('\t') for line in lines if line and not line.startswith('#')]
    assert not any(len(x) >= 3 and x[2] == '4202' and x[0] != 'amyb' for x in entries), 'Puerto reservado por otro proyecto'
    amyb = [x for x in entries if x[0] == 'amyb']
    assert not amyb or all(x[1:3] == ['api', '4202'] for x in amyb), 'Revisar reserva existente'
    if not amyb:
        lines.append('amyb\tapi\t4202\tprepared-2026-10-21')
    target.seek(0)
    target.write('\n'.join(lines) + '\n')
    target.truncate()

config = root / 'shared/config'
config.chmod(0o2770)
env = config / '.env.staging'
if not env.exists():
    template = Path(__file__).with_name('staging.env.example').read_text()
    values = {
        'DATABASE_URL': 'postgresql://amyb_staging_user:' + secrets.token_hex(24) + '@127.0.0.1:5432/amyb_staging?schema=public',
        'JWT_SECRET': secrets.token_hex(48),
        'ADMIN_PASSWORD': secrets.token_urlsafe(32),
    }
    for key, value in values.items():
        template = template.replace(key + '=\n', key + '=' + value + '\n')
    descriptor = os.open(env, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    with os.fdopen(descriptor, 'w') as target:
        target.write(template)
else:
    assert env.is_file() and not env.is_symlink(), 'Configuración inesperada'
    print('Se conserva la configuración staging existente.')
env.chmod(0o600)
print('Preparación completada: configuración privada y reserva 127.0.0.1:4202. No se activa ningún servicio.')
