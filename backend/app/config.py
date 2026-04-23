import os
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent

# 数据根目录：容器内默认为 /data（由 docker-compose 挂宿主 backend/data/ 进来）；
# 本机裸跑时可通过 DATA_DIR=/abs/path 覆盖，默认 fallback 到 backend/data/。
DATA_DIR = Path(os.getenv("DATA_DIR") or (BASE_DIR / "data"))
UPLOAD_DIR = Path(os.getenv("UPLOAD_DIR") or (DATA_DIR / "uploads"))
OUTPUT_DIR = Path(os.getenv("OUTPUT_DIR") or (DATA_DIR / "outputs"))
DB_PATH = Path(os.getenv("DB_PATH") or (DATA_DIR / "db.sqlite3"))
# 执行器每次起容器用的临时目录（按 job 隔离挂载点）
TMP_DIR = Path(os.getenv("TMP_DIR") or (DATA_DIR / "tmp"))

for _p in (DATA_DIR, UPLOAD_DIR, OUTPUT_DIR, TMP_DIR):
    _p.mkdir(parents=True, exist_ok=True)
