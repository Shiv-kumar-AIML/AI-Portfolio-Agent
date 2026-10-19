from app.agent.suggestions import SuggestionStreamFilter, parse_suggestions


def _stream(text: str, size: int) -> tuple[str, list[str]]:
    f = SuggestionStreamFilter()
    shown = "".join(f.feed(text[i : i + size]) for i in range(0, len(text), size))
    rest, suggestions = f.finish()
    return shown + rest, suggestions


def test_suggestions_are_split_out_at_any_chunk_size() -> None:
    reply = 'I build agents.\n<suggestions>["Show projects", "Contact you"]</suggestions>'
    for size in (1, 2, 5, 13, 200):
        shown, suggestions = _stream(reply, size)
        assert shown == "I build agents.\n"
        assert suggestions == ["Show projects", "Contact you"]


def test_partial_tag_is_never_shown() -> None:
    f = SuggestionStreamFilter()
    assert f.feed("Hello <sug") == "Hello "
    assert f.feed('gestions>["a"]') == ""
    assert f.finish() == ("", ["a"])


def test_a_lone_angle_bracket_is_released_at_the_end() -> None:
    shown, suggestions = _stream("x < y and a <b", 3)
    assert shown == "x < y and a <b"
    assert suggestions == []


def test_malformed_suggestions_fall_back_to_quoted_strings() -> None:
    assert parse_suggestions('["one", "two",]') == ["one", "two"]
    assert parse_suggestions("- first\n- second") == ["first", "second"]
    assert parse_suggestions('["a", "a", "b", "c", "d"]') == ["a", "b", "c"]
