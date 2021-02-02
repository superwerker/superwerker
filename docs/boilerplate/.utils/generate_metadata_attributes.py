#!/usr/bin/env python
import io
import cfnlint
from pathlib import Path

def get_cfn(filename):
    _decoded, _issues = cfnlint.decode.decode(filename)
    if not _decoded:
        print(f"Template: {filename} has an error. Run cfn-lint to determine the issue")
        sys.exit(1)
    return _decoded

def fetch_metadata():
    metadata_attributes = set()
    for yaml_cfn_file in Path('./templates').glob('*.template*'):
        template = get_cfn(Path(yaml_cfn_file))
        if not template:
            raise Exception(f"cfn-lint failed to load {yaml_cfn_file} without errors. Failure")
        _resources = template['Resources']
        for _resource in _resources.values():
            _type = _resource['Type'].lower()
            metadata_attributes.add(_type.split('::')[1])
            metadata_attributes.add(_type.replace('::','_'))
    with open('docs/generated/services/metadata.adoc', 'w') as f:
        f.write('\n')
        for attr in sorted(metadata_attributes):
            f.write(f":template_{attr}:\n")

if __name__ == '__main__':
    fetch_metadata()
