import sys
from pathlib import Path

import pytest
from starlette.testclient import TestClient

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import server


MCP_HEADERS = {
    "Accept": "application/json, text/event-stream",
    "Content-Type": "application/json",
}


@pytest.fixture(scope="module")
def client():
    # An MCP session manager has a single process lifespan by design, matching
    # the way uvicorn runs it in production.
    with TestClient(server.asgi_app) as test_client:
        yield test_client


def test_health_and_tool_discovery_are_protocol_compatible(client):
    health = client.get("/healthz")
    assert health.status_code == 200
    assert health.json()["protocol"] == "mcp-streamable-http"

    response = client.post(
        "/mcp",
        headers=MCP_HEADERS,
        json={"jsonrpc": "2.0", "id": 1, "method": "tools/list", "params": {}},
    )

    assert response.status_code == 200
    tools = response.json()["result"]["tools"]
    by_name = {tool["name"]: tool for tool in tools}
    assert {
        "list_tasks", "get_task", "create_task", "update_task", "assign_task",
        "update_task_status", "complete_task", "delete_task",
        "list_boards", "get_board", "create_board_column", "update_board_column",
        "reorder_board_column", "delete_board_column",
        "list_lab_projects", "get_lab_project", "create_lab_project",
        "update_lab_project", "archive_lab_project", "add_lab_project_member",
        "remove_lab_project_member", "list_users", "list_leads", "get_lead",
    } == set(by_name)
    assert by_name["list_tasks"]["annotations"]["readOnlyHint"] is True
    assert by_name["create_task"]["annotations"]["readOnlyHint"] is False
    assert by_name["delete_task"]["annotations"]["destructiveHint"] is True
    assert by_name["archive_lab_project"]["annotations"]["destructiveHint"] is True
    assert "outputSchema" in by_name["get_task"]


def test_missing_api_key_is_reported_as_mcp_tool_error(client):
    response = client.post(
        "/mcp",
        headers=MCP_HEADERS,
        json={
            "jsonrpc": "2.0",
            "id": 2,
            "method": "tools/call",
            "params": {"name": "list_tasks", "arguments": {}},
        },
    )

    result = response.json()["result"]
    assert result["isError"] is True
    assert "API-ключ" in result["content"][0]["text"]


def test_api_key_header_parsing_supports_common_clients():
    assert server._extract_api_key({"Authorization": "Bearer nvo_secret"}) == "nvo_secret"
    assert server._extract_api_key({"x-api-key": " nvo_other "}) == "nvo_other"
    assert server._extract_api_key({}) is None


def test_project_and_board_crud_tools_forward_typed_requests(client, monkeypatch):
    calls = []

    async def fake_call(ctx, method, path, **kwargs):
        calls.append((method, path, kwargs))
        if path == "/lab-projects":
            return {
                "id": 7,
                "name": kwargs["json"]["name"],
                "board_id": 25,
                "members": [],
            }
        return {"ok": True}

    monkeypatch.setattr(server, "_call", fake_call)
    headers = {**MCP_HEADERS, "X-API-Key": "nvo_test"}

    created = client.post(
        "/mcp",
        headers=headers,
        json={
            "jsonrpc": "2.0",
            "id": 10,
            "method": "tools/call",
            "params": {
                "name": "create_lab_project",
                "arguments": {"name": "EspaMed", "member_ids": [2, 3]},
            },
        },
    )
    assert created.status_code == 200
    assert created.json()["result"]["isError"] is False
    assert calls[-1] == (
        "POST",
        "/lab-projects",
        {
            "json": {
                "name": "EspaMed",
                "description": "",
                "status": "Идея",
                "member_ids": [2, 3],
            }
        },
    )

    refused = client.post(
        "/mcp",
        headers=headers,
        json={
            "jsonrpc": "2.0",
            "id": 11,
            "method": "tools/call",
            "params": {"name": "delete_board_column", "arguments": {"column_id": 9}},
        },
    )
    assert refused.json()["result"]["isError"] is True
    assert "confirm=true" in refused.json()["result"]["content"][0]["text"]

    deleted = client.post(
        "/mcp",
        headers=headers,
        json={
            "jsonrpc": "2.0",
            "id": 12,
            "method": "tools/call",
            "params": {
                "name": "delete_board_column",
                "arguments": {"column_id": 9, "confirm": True},
            },
        },
    )
    assert deleted.json()["result"]["isError"] is False
    assert calls[-1] == ("DELETE", "/boards/columns/9", {})
