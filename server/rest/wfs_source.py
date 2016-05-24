#!/usr/bin/env python
# -*- coding: utf-8 -*-

###############################################################################
#  Copyright Kitware Inc.
#
#  Licensed under the Apache License, Version 2.0 ( the "License" );
#  you may not use this file except in compliance with the License.
#  You may obtain a copy of the License at
#
#    http://www.apache.org/licenses/LICENSE-2.0
#
#  Unless required by applicable law or agreed to in writing, software
#  distributed under the License is distributed on an "AS IS" BASIS,
#  WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
#  See the License for the specific language governing permissions and
#  limitations under the License.
###############################################################################

from os import environ

from owslib.wfs import WebFeatureService

from girder.api import access
from girder.api.describe import Description
from girder.api.rest import getUrlParts, RestException

from girder.plugins.minerva.rest.source import Source
from girder.plugins.minerva.utility.bsve import bsve_utility


class WfsSource(Source):

    def __init__(self):
        self.resourceName = 'minerva_source_wfs'
        self.route('POST', (), self.createWfsSource)

    @access.user
    def createWfsSource(self, params):
        name = params['name']
        baseURL = params['baseURL']
        parsedUrl = getUrlParts(baseURL)
        hostName = parsedUrl.netloc
        # WFS in owslib can't deal with auth headers, so we call the request
        # and pass the XML to owslib for processing.
        user = environ.get('BSVE_USERNAME')
        apikey = environ.get('BSVE_APIKEY')
        secret = environ.get('BSVE_SECRETKEY')
        bu = bsve_utility.BsveUtility(user=user, apikey=apikey, secret=secret,
                                      base=baseURL)
        url = '%s/api/data/v2/sources/wfs/meta/GetCapabilities' % baseURL
        resp = bu._session.request(url=url, headers=bu._auth_header(),
                                   method="GET")
        # baseURL is passed but unused
        if resp.status_code != 200:
            raise RestException('WFS Source GetCapabilities returned %s' % (resp.status_code))
        wfs = WebFeatureService(baseURL, xml=resp.content, version='1.1.0')
        layersType = list(wfs.contents)
        layers = []
        for layerType in layersType:
            layer = {
                'layer_title': wfs[layerType].title,
                'layer_type': layerType
            }
            layers.append(layer)

        minerva_metadata = {
            'source_type': 'wfs',
            'layers': layers,
            'wfs_params': {
                'base_url': baseURL,
                'host_name': hostName
            }
        }
        desc = 'wfs source for  %s' % name
        return self.createSource(name, minerva_metadata, desc)
    createWfsSource.description = (
        Description('Create a source from an external wfs server.')
        .responseClass('Item')
        .param('name', 'The name of the wfs source', required=True)
        .param('baseURL', 'URL where the wfs is served', required=True)
        .errorResponse('Write permission denied on the source folder.', 403))
