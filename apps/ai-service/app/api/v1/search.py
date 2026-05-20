# pyrefly: ignore [missing-import]
from fastapi import APIRouter, HTTPException, Query

from app.schemas.search_schema import InstantSearchResponse
from app.services.search_service import SearchService

router = APIRouter()
search_service = SearchService()


@router.get("/search/instant", response_model=InstantSearchResponse)
def instant_search(
    q: str = Query(..., min_length=1, description="Search query text"),
    mode: str = Query(
        default="home",
        description="'home' for keywords only, 'search' for keywords + properties",
    ),
) -> InstantSearchResponse:
    """
    AI-powered instant search endpoint.

    - **mode=home**: Returns keyword suggestions only (for home page search bar).
    - **mode=search**: Returns keyword suggestions + property cards + extracted filters
      (for search page search bar).
    """
    if mode not in ("home", "search"):
        mode = "home"

    try:
        result = search_service.instant_search(query=q, mode=mode)
        return InstantSearchResponse(**result)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc
