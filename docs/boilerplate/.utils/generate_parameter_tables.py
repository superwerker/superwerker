#!/usr/bin/env python
import io
import cfnlint
import datetime
import sys
from pathlib import Path


def get_cfn(filename):
    _decoded, _issues = cfnlint.decode.decode(filename)
    if not _decoded:
        print(f"Template: {filename} has an error. Run cfn-lint to determine the issue")
        sys.exit(1)
    return _decoded

def _generate_table_name_and_header(label_name):
    data = []
    data.append(f"\n.{label_name}")
    data.append('[width="100%",cols="16%,11%,73%",options="header",]')
    data.append("|===")
    data.append("|Parameter label (name) |Default value|Description")
    return "\n".join(data)

def _generate_per_label_table_entry(label, param, default, description):
    data = []
    if not label:
        label = "**NO_LABEL**"
    data.append(f"|{label}")
    data.append(f"(`{param}`)|`{default}`|{description}")
    return '\n'.join(data)

def just_pass():
    template_entrypoints = {}
    template_order = {}
    found_files_with_glob_pattern=False
    for yaml_cfn_file in Path('./templates').glob('*.template*'):
        found_files_with_glob_pattern=True
        print(f"Working on {yaml_cfn_file}")
        template = get_cfn(Path(yaml_cfn_file))
        if not template:
            raise Exception(f"cfn-lint failed to load {yaml_cfn_file} without errors. Failure")
        entrypoint = template.get('Metadata', {}).get('QuickStartDocumentation', {}).get('EntrypointName')
        if not entrypoint:
            print(f"- No documentation entrypoint found. Continuing.")
            continue
        order = template.get('Metadata',{}).get('QuickStartDocumentation',{}).get('Order')
        if not order:
            print(f"- No documentation order found. Assigning x.")
            order = 'x'
        _pf = Path(yaml_cfn_file).stem + ".adoc"
        p_file = f"docs/generated/parameters/{_pf}"
        template_entrypoints[p_file.split('/')[-1]] = entrypoint
        template_order[p_file.split('/')[-1]] = str(order)

        label_mappings = {}
        reverse_label_mappings = {}
        parameter_mappings = {}
        parameter_labels = {}
        no_groups = {}

        def determine_optional_value(param):
            optional = template['Metadata'].get('QuickStartDocumentation', {}).get('OptionalParameters')
            if optional and (param in optional):
                return '__Optional__'
            return '**__Requires input__**'

        for label in template['Metadata']['AWS::CloudFormation::Interface']['ParameterGroups']:
            label_name = label['Label']['default']
            label_params = label['Parameters']
            label_mappings[label_name] = label_params
            for ln in label_params:
                reverse_label_mappings[ln] = label_name

        for label_name, label_data in template['Metadata']['AWS::CloudFormation::Interface']['ParameterLabels'].items():
            parameter_labels[label_name] = label_data.get('default')

        for param_name, param_data in template['Parameters'].items():
            if param_data.get('Default') == '':
                param_data['Default'] = '**__Blank string__**'
            parameter_mappings[param_name] = param_data
            if not reverse_label_mappings.get(param_name):
                no_groups[param_name] = param_data

        adoc_data = ""
        for label_name, label_params in label_mappings.items():
            header = _generate_table_name_and_header(label_name)
            adoc_data += header

            for lparam in label_params:

                param_data = _generate_per_label_table_entry(
                        parameter_labels.get(lparam, ''),
                        lparam,
                        parameter_mappings[lparam].get('Default', determine_optional_value(lparam)),
                        parameter_mappings[lparam].get('Description', 'NO_DESCRIPTION')
                )
                adoc_data += param_data
            adoc_data += "\n|==="

        print(f"- Generating: {p_file}")
        with open (p_file, 'w') as p:
            p.write(adoc_data)
    if not found_files_with_glob_pattern:
        raise Exception("No files matching templates/*.template.(json|yaml|yml) were found. Unable to build documentation. Exiting.")
    if not template_entrypoints:
        raise Exception("No documentation entrypoints (Metadata => QuickStartDocumentation => EntrypointName)  were found. Unable to build documentation. Exiting.")
    with open('docs/generated/parameters/index.adoc', 'w') as f:
        for template_file, order in sorted(template_order.items(), key=lambda x: x[1]):
            print (f"Index - {order} - {template_entrypoints.get(template_file)} - {template_file}")
            f.write(f"\n=== {template_entrypoints.get(template_file)}\n")
            f.write(f"include::{template_file}[]\n")

if __name__ == '__main__':
    print("---")
    print("> Milton, don't be greedy. Let's pass it along and make sure everyone gets a piece.")
    print("> Can I keep a piece, because last time I was told that...")
    print("> Just pass.")
    print("---")
    just_pass()
    print("---")
