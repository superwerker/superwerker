# Copyright 2020-2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
#
# Licensed under the Amazon Software License (the "License"). You may not use this file except in compliance with the License.
# A copy of the License is located at
#
#    http://aws.amazon.com/asl/
#
# or in the "license" file accompanying this file.
# This file is distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, express or implied.
# See the License for the specific language governing permissions and limitations under the License.

FROM asciidoctor/docker-asciidoctor

RUN apk add --no-cache \
    py3-pip \
    python3 \
    zip \
    rsync
RUN wget https://raw.githubusercontent.com/REPO/BRANCH/.utils/requirements.txt -O /tmp/req.txt
RUN ln -sf /usr/bin/pip3 /usr/bin/pip
RUN ln -sf /usr/bin/python3 /usr/bin/python
RUN pip3 install awscli
RUN pip3 install -r /tmp/req.txt
ENTRYPOINT ["dockerd-entrypoint.sh"]
