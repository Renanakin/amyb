#!/usr/bin/env python3
"""Única operación privilegiada de PostgreSQL. No muestra contraseñas."""
import os
from pathlib import Path
import re
import subprocess
from urllib.parse import urlsplit

assert os.geteuid() == 0, 'Este archivo requiere root'
config = Path('/var/www/staging/amyb/shared/config/.env.staging')
values = dict(line.split('=', 1) for line in config.read_text().splitlines() if line and not line.startswith('#'))
url = urlsplit(values['DATABASE_URL'])
assert url.hostname == '127.0.0.1' and url.port == 5432
assert url.username == 'amyb_staging_user' and url.path == '/amyb_staging'
assert re.fullmatch('[0-9a-f]{48}', url.password or ''), 'Formato de contraseña inesperado'

def psql(sql):
    result = subprocess.run(['runuser', '-u', 'postgres', '--', 'psql', '-X', '-q', '-tA', '-v', 'ON_ERROR_STOP=1', '-d', 'postgres'], input=sql, text=True, capture_output=True)
    if result.returncode:
        raise SystemExit('PostgreSQL rechazó la preparación. Revisar el servicio; los detalles sensibles no se imprimen.')
    return result.stdout.strip()

owner = psql("SELECT pg_get_userbyid(datdba) FROM pg_database WHERE datname='amyb_staging';")
assert not owner or owner == 'amyb_staging_user', 'La base existente tiene otro propietario; no se modifica'
exists = psql("SELECT 1 FROM pg_roles WHERE rolname='amyb_staging_user';")
if exists:
    flags = psql("SELECT rolsuper OR rolcreatedb OR rolcreaterole OR rolreplication OR rolbypassrls FROM pg_roles WHERE rolname='amyb_staging_user';")
    assert flags == 'f', 'Revisar privilegios de la cuenta existente'
else:
    psql("CREATE ROLE amyb_staging_user LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS PASSWORD '" + url.password + "';")
if not owner:
    psql('CREATE DATABASE amyb_staging OWNER amyb_staging_user;')
psql('REVOKE ALL ON DATABASE amyb_staging FROM PUBLIC; GRANT CONNECT, TEMPORARY ON DATABASE amyb_staging TO amyb_staging_user;')
print('Base amyb_staging y cuenta exclusiva preparadas. No se modificaron otros proyectos.')
