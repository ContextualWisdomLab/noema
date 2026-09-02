"""Tests for the shared Agent-construction wiring."""

from __future__ import annotations

from pydantic_ai import Agent
from pydantic_ai.models.openai import OpenAIChatModel
from pydantic_ai.models.test import TestModel

from noema_core import NOEMA_PERSONA, build_agent, build_openai_model


def test_build_openai_model_wires_an_openai_chat_model() -> None:
    """build_openai_model returns a PydanticAI model wired to the given settings."""
    model = build_openai_model(
        base_url="https://orchestrator.example/v1",
        api_key="k",
        model_name="contextual-orchestrator",
    )
    assert isinstance(model, OpenAIChatModel)
    assert model.model_name == "contextual-orchestrator"


def test_build_agent_applies_output_type_and_system_prompt() -> None:
    """build_agent constructs an Agent carrying the caller's schema and prompt."""
    agent = build_agent(
        TestModel(),
        system_prompt=NOEMA_PERSONA,
        output_type=str,
        retries=2,
    )
    assert isinstance(agent, Agent)
    result = agent.run_sync("hello")
    assert isinstance(result.output, str)


def test_build_agent_forwards_deps_type_only_when_given() -> None:
    """A caller that needs deps machinery can pass deps_type; others get none."""
    agent = build_agent(
        TestModel(),
        system_prompt=NOEMA_PERSONA,
        output_type=str,
        deps_type=dict,
    )
    assert agent.deps_type is dict


def test_noema_persona_names_the_organization() -> None:
    """The shared persona fragment names Noema and the organization it serves."""
    assert "Noema" in NOEMA_PERSONA
    assert "ContextualWisdomLab" in NOEMA_PERSONA
