import pytest

from app.rag.knowledge_base import KnowledgeBase
from app.tools.context import ToolContext
from app.tools.link_tools import OpenLinkTool


def make_tool(kb: KnowledgeBase) -> OpenLinkTool:
    return OpenLinkTool(ToolContext(kb=kb, gateway=None, session_id=None))  # type: ignore[arg-type]


@pytest.mark.parametrize(
    "url",
    [
        "https://github.com/your-github/portfolio",  # a project link
        "https://github.com/your-github/some-other-repo",  # any repo of the socials account
        "https://github.com/octocat/x",  # any repo of githubUsername
        "https://www.linkedin.com/in/your-linkedin/",  # socials, trailing slash
        "/resume.pdf",
    ],
)
async def test_opens_the_owners_links(kb: KnowledgeBase, url: str) -> None:
    result = await make_tool(kb)({"url": url})
    assert result.ok
    assert result.ui == {"url": url}


@pytest.mark.parametrize(
    "url",
    [
        "https://github.com/someone-else/repo",
        "https://evil.example.com/github.com/your-github",
        "http://github.com/your-github/portfolio",
        "javascript:alert(1)//",
        "/admin",
    ],
)
async def test_refuses_anything_else_as_data(kb: KnowledgeBase, url: str) -> None:
    result = await make_tool(kb)({"url": url})
    assert not result.ok
    assert result.ui is None
    assert "error" in result.data
