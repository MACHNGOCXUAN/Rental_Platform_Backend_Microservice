import csv
import os
import threading
from datetime import datetime
from pathlib import Path

# Default search history data for cold start
_DEFAULT_HISTORY = [
    "căn hộ quận 7 giá rẻ",
    "chung cư vinhomes tân bình",
    "phòng trọ bình thạnh có gác",
    "thuê nhà nguyên căn quận 2",
    "căn hộ 2 phòng ngủ giá tốt quận 7",
    "phòng trọ gần đại học bách khoa",
    "nhà nguyên căn thủ đức 3 phòng ngủ",
    "căn hộ studio quận 1",
    "phòng trọ quận gò vấp dưới 3 triệu",
    "văn phòng cho thuê quận 3",
]

_CSV_COLUMNS = ["query", "timestamp", "count"]


class SearchHistoryManager:
    """Manages search history using a CSV file for lightweight persistence."""

    def __init__(self, csv_path: str = "data/search_history.csv") -> None:
        self._csv_path = Path(csv_path)
        self._lock = threading.Lock()
        self._ensure_file()

    def _ensure_file(self) -> None:
        """Create data directory and CSV file with default data if not exist."""
        self._csv_path.parent.mkdir(parents=True, exist_ok=True)
        if not self._csv_path.exists():
            with open(self._csv_path, "w", newline="", encoding="utf-8") as f:
                writer = csv.DictWriter(f, fieldnames=_CSV_COLUMNS)
                writer.writeheader()
                now = datetime.now().isoformat()
                for query in _DEFAULT_HISTORY:
                    writer.writerow({"query": query, "timestamp": now, "count": 1})

    def _read_all(self) -> list[dict]:
        """Read all rows from CSV."""
        rows: list[dict] = []
        try:
            with open(self._csv_path, "r", encoding="utf-8") as f:
                reader = csv.DictReader(f)
                for row in reader:
                    row["count"] = int(row.get("count", 1))
                    rows.append(row)
        except (FileNotFoundError, csv.Error):
            pass
        return rows

    def _write_all(self, rows: list[dict]) -> None:
        """Write all rows to CSV (overwrite)."""
        with open(self._csv_path, "w", newline="", encoding="utf-8") as f:
            writer = csv.DictWriter(f, fieldnames=_CSV_COLUMNS)
            writer.writeheader()
            for row in rows:
                writer.writerow(row)

    def add_search(self, query: str) -> None:
        """Add or increment a search query in history."""
        if not query or not query.strip():
            return
        normalized = query.strip().lower()

        with self._lock:
            rows = self._read_all()
            found = False
            for row in rows:
                if row["query"].strip().lower() == normalized:
                    row["count"] = int(row.get("count", 1)) + 1
                    row["timestamp"] = datetime.now().isoformat()
                    found = True
                    break

            if not found:
                rows.append({
                    "query": query.strip(),
                    "timestamp": datetime.now().isoformat(),
                    "count": 1,
                })

            # Keep only the most recent 500 entries
            rows.sort(key=lambda r: r.get("timestamp", ""), reverse=True)
            rows = rows[:500]
            self._write_all(rows)

    def get_recent_searches(self, limit: int = 20) -> list[str]:
        """Get most recent search queries."""
        with self._lock:
            rows = self._read_all()
        rows.sort(key=lambda r: r.get("timestamp", ""), reverse=True)
        return [r["query"] for r in rows[:limit]]

    def get_trending_searches(self, limit: int = 10) -> list[str]:
        """Get most popular search queries by count."""
        with self._lock:
            rows = self._read_all()
        rows.sort(key=lambda r: int(r.get("count", 0)), reverse=True)
        return [r["query"] for r in rows[:limit]]

    def get_history_for_prompt(self, limit: int = 15) -> str:
        """Format search history as bullet-point list for LLM prompt."""
        trending = self.get_trending_searches(limit)
        if not trending:
            return "\n".join(f"- {q}" for q in _DEFAULT_HISTORY[:limit])
        return "\n".join(f"- {q}" for q in trending)


# Singleton instance
search_history = SearchHistoryManager()
