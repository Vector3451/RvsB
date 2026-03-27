"""
OpenEnv Core Base Classes — Abstract contracts for all environments.
"""
from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from typing import Any, Dict, Generic, Optional, TypeVar


@dataclass
class Action:
    """Base class for all environment actions."""
    metadata: Dict[str, Any] = field(default_factory=dict)


@dataclass
class Observation:
    """Base class for all environment observations."""
    done: bool = False
    reward: Optional[float] = None
    metadata: Dict[str, Any] = field(default_factory=dict)


@dataclass
class State:
    """Base class for episode metadata."""
    episode_id: Optional[str] = None
    step_count: int = 0


ActionT = TypeVar("ActionT", bound=Action)
ObsT = TypeVar("ObsT", bound=Observation)
StateT = TypeVar("StateT", bound=State)


class Environment(ABC, Generic[ActionT, ObsT, StateT]):
    """
    Abstract base class every OpenEnv environment must implement.
    The server layer wraps this with FastAPI endpoints.
    """

    @abstractmethod
    def reset(self) -> ObsT:
        """Start a new episode, return initial observation."""

    @abstractmethod
    def step(self, action: ActionT) -> ObsT:
        """Execute an action, advance state, return next observation."""

    @property
    @abstractmethod
    def state(self) -> StateT:
        """Return current episode metadata."""
