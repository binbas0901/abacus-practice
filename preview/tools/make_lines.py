#!/usr/bin/env python3
# Generate the app's runtime copies of the classroom content:
#   audio/lines-manifest.js  ->  window.LINES_MANIFEST = { "<key>": {text,who,tuning,when}, ... }
#   audio/lessons.js         ->  window.LESSONS        = { "<nodeId>": {title, steps:[...]}, ... }
# from the READ-ONLY content files written by the content track:
#   /home/claude/voices/manifest.json  and  /home/claude/voices/lessons.json
#
# Those JSON files may be absent or partial while the content is still being written.
# When either is missing this script keeps a small built-in STUB so the app still builds,
# runs and tests (jokes, tap lines, and one lesson with a bixi_wrong/ask_help pair).
# It never writes back into /home/claude/voices. Run:  python3 -I tools/make_lines.py
import json, os, sys

HERE = os.path.dirname(os.path.abspath(__file__))
APP = os.path.dirname(HERE)
VOICES = os.environ.get('VOICES_DIR', '/home/claude/voices')

# ---- built-in stub (used per-file only when the real JSON is absent) ----
STUB_MANIFEST = {
    # greetings (Juni, the teacher, leads the room)
    "j_hello_morning": {"text": "Good morning. Ready to move some beads?", "who": "juni", "tuning": "default", "when": "home, morning"},
    "j_hello_afternoon": {"text": "Good afternoon. Let's do some abacus.", "who": "juni", "tuning": "default", "when": "home, afternoon"},
    "j_hello_evening": {"text": "Good evening. A little practice before bed?", "who": "juni", "tuning": "default", "when": "home, evening"},
    "j_hello_back": {"text": "You're back. I'm glad.", "who": "juni", "tuning": "default", "when": "home, returning"},
    "j_praise_sf": {"text": "Lovely. Small friends make it easy.", "who": "juni", "tuning": "default", "when": "after a small-friend win"},
    # Juni tap lines (tap the moon)
    "j_tap_1": {"text": "Slow and right comes first. Fast comes later, all by itself.", "who": "juni", "tuning": "default", "when": "tap Juni"},
    "j_tap_2": {"text": "A little practice every day. That's the whole secret.", "who": "juni", "tuning": "default", "when": "tap Juni"},
    "j_tap_3": {"text": "Lift your bead hand. Let it float above the beads.", "who": "juni", "tuning": "default", "when": "tap Juni"},
    # Bixi tap lines (tap the bead)
    "b_tap_1": {"text": "Hee hee, that tickles!", "who": "bixi", "tuning": "lively", "when": "tap Bixi"},
    "b_tap_2": {"text": "Boing! I'm the fastest bead!", "who": "bixi", "tuning": "lively", "when": "tap Bixi"},
    "b_tap_bounce": {"text": "Again! Tap me again!", "who": "bixi", "tuning": "lively", "when": "tap Bixi"},
    # Bixi silly bits (play with a move; see the Bixi moments scheduler)
    "b_bit_roll": {"text": "Wheee! Watch me roll!", "who": "bixi", "tuning": "lively", "when": "bixi moment: roll"},
    "b_bit_dizzy": {"text": "Whoa, too many spins. The beads are dancing!", "who": "bixi", "tuning": "lively", "when": "bixi moment: dizzy"},
    "b_bit_warmup": {"text": "Stretch those beads! One, two, one, two!", "who": "bixi", "tuning": "lively", "when": "bixi moment: warm-up"},
    "b_bit_bow": {"text": "Thank you, thank you. The fastest bead takes a bow.", "who": "bixi", "tuning": "lively", "when": "bixi moment: bow"},
    "b_bit_sleepy": {"text": "Just resting my beads for one tiny second.", "who": "bixi", "tuning": "lively", "when": "bixi moment: sleep"},
    # Bixi jokes (two clips each: question then punchline, with a pause between)
    "b_joke_six_q": {"text": "Why was six afraid of seven?", "who": "bixi", "tuning": "lively", "when": "joke question"},
    "b_joke_six_a": {"text": "Because seven ate nine!", "who": "bixi", "tuning": "lively", "when": "joke answer"},
    "b_joke_zero_q": {"text": "What did the zero say to the eight?", "who": "bixi", "tuning": "lively", "when": "joke question"},
    "b_joke_zero_a": {"text": "Nice belt!", "who": "bixi", "tuning": "lively", "when": "joke answer"},
    "b_joke_dance_q": {"text": "What is a bead's favourite dance?", "who": "bixi", "tuning": "lively", "when": "joke question"},
    "b_joke_dance_a": {"text": "The slide!", "who": "bixi", "tuning": "lively", "when": "joke answer"},
}

STUB_LESSONS = {
    # One worked lesson with a bixi_wrong / ask_help pair, for building and testing the
    # classroom flow before the real 22 lessons land. The bead math comes from curriculum.js.
    "sf_add": {"title": "Small friends +", "steps": [
        {"id": "l_sf_add_open", "who": "juni", "tuning": "default", "text": "Small friends help us add. Watch the beads.", "act": "say"},
        {"id": "l_sf_add_watch1", "who": "juni", "text": "Add the small friend, then take the five.", "act": "watch"},
        {"id": "l_sf_add_turn1", "who": "juni", "text": "Your turn. Move the beads.", "act": "your_turn"},
        {"id": "l_sf_add_slip", "who": "bixi", "tuning": "maths", "text": "Easy. I just take the number away!", "act": "bixi_wrong", "wrong": "takes away the number instead of using its small friend"},
        {"id": "l_sf_add_help", "who": "juni", "text": "Oops. Can you help Bixi? Show the right beads.", "act": "ask_help"},
        {"id": "l_sf_add_thanks", "who": "bixi", "tuning": "maths", "text": "Thank you! You fixed it. You are the fastest bead.", "act": "bixi_thanks"},
        {"id": "l_sf_add_close", "who": "juni", "text": "You did it. Small friends make adding easy.", "act": "close"},
    ]},
}


def load(path, stub):
    try:
        with open(path, 'r') as f:
            data = json.load(f)
        if isinstance(data, dict) and data:
            return data, True
    except FileNotFoundError:
        pass
    except Exception as e:
        print("warn: could not read %s (%s); using stub" % (path, e), file=sys.stderr)
    return stub, False


def write_global(out_path, varname, data, src_note):
    body = json.dumps(data, ensure_ascii=False, indent=1)
    with open(out_path, 'w') as f:
        f.write("// Generated by tools/make_lines.py (%s). Do not edit by hand.\n" % src_note)
        f.write("window.%s = %s;\n" % (varname, body))
    print("wrote %s (%d entries, %s)" % (out_path, len(data), src_note))


def main():
    man, man_real = load(os.path.join(VOICES, 'manifest.json'), STUB_MANIFEST)
    les, les_real = load(os.path.join(VOICES, 'lessons.json'), STUB_LESSONS)
    write_global(os.path.join(APP, 'audio', 'lines-manifest.js'), 'LINES_MANIFEST', man,
                 'from voices/manifest.json' if man_real else 'STUB — voices/manifest.json absent')
    write_global(os.path.join(APP, 'audio', 'lessons.js'), 'LESSONS', les,
                 'from voices/lessons.json' if les_real else 'STUB — voices/lessons.json absent')


if __name__ == '__main__':
    main()
