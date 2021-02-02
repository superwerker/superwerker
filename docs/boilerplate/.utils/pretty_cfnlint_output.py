#!/usr/bin/env python
import sys
import json

fn = sys.argv[1]

severity_to_icon = {
    'Warning':u'\u270B',
    'Error':u'\u274C'
}

results = {}

with open(fn) as f:
    x = json.load(f)

for rule_match in x:
    _fn = rule_match['Filename']
    _sl = rule_match['Location']['Start']['LineNumber']
    _el = rule_match['Location']['End']['LineNumber']
    _msg = rule_match['Message']
    _lvl = rule_match['Level']
    _rid = rule_match['Rule']['Id']
    try:
        results[_fn][_sl] = (_lvl, _rid,  _msg)
    except KeyError:
        results[_fn] = {_sl:(_lvl, _rid,  _msg)}

for k in sorted(results.keys()):
    print('\n{}'.format(k))
    for l,v in results[k].items():
        print("- {} [{}] ({}) |  Line: {} - {}".format(severity_to_icon.get(v[0]), v[0].upper(), v[1], l, v[2]))
