/**
 * Created by Andy Likuski on 2018.12.31
 * Copyright (c) 2018 Andy Likuski
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
 */

import {testAuthTask} from '../helpers/testHelpers.js';
import {mergeMapboxes, queryScopesMergeScopePropPathValueContainer} from './scopePropertyStore.js';
import * as R from 'ramda';
import {
  composeWithChain,
  defaultRunConfig,
  mapToMergedResponseAndInputs,
  mapToNamedPathAndInputs,
  mapToNamedResponseAndInputs
} from '@rescapes/ramda';
import {mapboxOutputParamsFragment} from '../stores/mapStores/mapboxOutputParams.js';
import {rescapePlaceDefaultSettingsKey} from '../helpers/privateSettings.js';
import {currentUserQueryContainer, expectKeys, userOutputParams} from '@rescapes/apollo';
import {mutateSampleUserStateWithProjectsAndRegionsContainer} from './userStores/userStateStore.sample.js';

describe('scopePropertyStore', () => {
  test('queryScopesMergeScopePropPathValueContainer', done => {
    const someMapboxKeys = ['data.mapbox.viewport.extent'];
    const errors = [];
    expect.assertions(1);
    composeWithChain([
      // Now that we have a user, region, and project, we query
      ({apolloConfig, user, regions, projects}) => {
        return queryScopesMergeScopePropPathValueContainer(
          apolloConfig,
          {
            outputParamsFragment: mapboxOutputParamsFragment,
            mergeFunction: mergeMapboxes,
            scopePropPath: 'mapbox',
            userScopePropPath: 'mapbox'
          },
          {
            settings: {key: rescapePlaceDefaultSettingsKey},
            user: R.pick(['id'], user)
          }
        );
      },

      mapToMergedResponseAndInputs(
        ({apolloConfig, user}) => {
          return mutateSampleUserStateWithProjectsAndRegionsContainer(apolloConfig,
            {forceDelete: true},
            {
              user: R.pick(['id'], user),
              regionKeys: ['earth'],
              projectKeys: ['shrangrila', 'pangea']
            });
        }
      ),
      mapToNamedPathAndInputs('user', 'data.currentUser',
        ({apolloConfig}) => {
          return currentUserQueryContainer(apolloConfig, userOutputParams, {});
        }
      ),

      // Authenticate
      mapToNamedResponseAndInputs('apolloConfig',
        () => testAuthTask()
      )
    ])().run().listen(defaultRunConfig({
      onResolved:
        response => {
          expectKeys(someMapboxKeys, response);
          done();
        }
    }, errors, done));
  }, 2000000);
});