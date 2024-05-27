import os
from unittest.mock import MagicMock, Mock, PropertyMock, patch
import pytest
from index import CREATE, handler




def test_enabled():
    assert True