Chạy file main.py

$env:PORT=50055
venv\Scripts\python -m uvicorn app.main:app --reload --port $env:PORT