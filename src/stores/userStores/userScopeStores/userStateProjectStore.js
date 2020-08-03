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

import * as R from 'ramda';
import PropTypes from 'prop-types';
import {v} from 'rescape-validate';
import {makeProjectsQueryContainer} from '../../scopeStores/project/projectStore';
import {makeUserStateScopeObjsMutationContainer, makeUserStateScopeObjsQueryContainer} from './userStateHelpers'
import {
  userScopeOutputParamsFragmentDefaultOnlyIds,
  userStateOutputParamsCreator,
  userStateReadInputTypeMapper
} from '../userStateStore';
import {projectOutputParams} from '../../../stores/scopeStores/project/projectStore';
import {selectionOutputParamsFragment} from '../selectionStore';
import {activityOutputParamsFragment} from '../activityStore';
import {renameKey} from 'rescape-ramda';
import {filterOutReadOnlyVersionProps} from 'rescape-apollo';

// Variables of complex input type needs a type specified in graphql. Our type names are
// always in the form [GrapheneFieldType]of[GrapheneModeType]RelatedReadInputType
// Following this location.data is represented as follows:
// TODO These value should be derived from the schema
const readInputTypeMapper = {
  //'data': 'DataTypeofLocationTypeRelatedReadInputType'
  'user': 'UserTypeofUserStateTypeRelatedReadInputType'
};

export const userStateProjectOutputParams = (explicitProjectOutputParams = projectOutputParams) => R.mergeAll([
  {
    project: explicitProjectOutputParams,
    mapbox: {
      viewport: {
        latitude: 1,
        longitude: 1,
        zoom: 1
      }
    }
  },
  selectionOutputParamsFragment,
  activityOutputParamsFragment]
);

/**
 * Queries projects that are in the scope of the user and the values of that project
 * @param {Object} config
 * @param {Object} config.apolloConfig Configuration of the Apollo Client when using one instead of an Apollo Component
 * @param {Object} config.apolloConfig.apolloClient An authorized Apollo Client
 * @param {Object} outputParamSets Optional outputParam sets to override the defaults
 * @param {Object} [outputParamSets.userStateProjectOutputParams] Optional userProject output params.
 * Defaults to projectStore.projectOutputParams
 * @param {Object} propSets The props used for the query. userState and project objects are required
 * @param {Object} propSets.userState Props for the UserStates queries {user: {id: }} is required to limit
 * the query to one user
 * @param {Object} propSets.userScope Object matching the shape of the userProject to mutate in the user state
 * @param {Object} propSets.userScope.project Object matching the shape of the project to mutate in the user state
 * @param {Number} propSets.userScope.project.id Required id of the project to update or add in userState.data.userProjec
 * Projects will be limited to those returned by the UserState query. These should not specify ids since
 * the UserState query selects the ids
 * @returns {Object} The resulting Projects in a Task in {data: usersProjects: [...]}}
 */
export const userStateProjectsQueryContainer = v(R.curry((
  {apolloConfig}, {
    userProjectOutputParams: explicitUserProjectOutputParams
  }, propSets) => {
    const scopeName = 'project';
    return makeUserStateScopeObjsQueryContainer(
      apolloConfig,
      {
        scopeQueryContainer: makeProjectsQueryContainer,
        scopeName,
        readInputTypeMapper: userStateReadInputTypeMapper,
        userStateOutputParamsCreator: userScopeOutputParams => {
          const params = userStateOutputParamsCreator(
            userScopeOutputParamsFragmentDefaultOnlyIds(scopeName, userScopeOutputParams)
          );
          return params;
        },
        userScopeOutputParams: explicitUserProjectOutputParams || userStateProjectOutputParams()
      },
      renameKey(R.lensPath([]), 'userProject', 'userScope', propSets)
    );
  }),
  [
    ['apolloConfig', PropTypes.shape({apolloClient: PropTypes.shape()}).isRequired],
    ['outputParamSets', PropTypes.shape({
      projectOutputParams: PropTypes.shape()
    })],
    ['propSets', PropTypes.shape({
      userState: PropTypes.shape().isRequired,
      userProject: PropTypes.shape({
        project: PropTypes.shape()
      })
    })]
  ], 'userStateProjectsQueryContainer');

/**
 *  Mutates the given userState.data.userProjects with the given project
 * If a matching project is in userState.data.userProjects it is updated, otherwise it is added
 * @param {Object} apolloConfig The Apollo config. See makeQueryContainer for options
 * @param [Object] userScopeOutputParams Project output params that will be returned for the mutated project
 * within the user state
 * @param {Object} propSets Object matching the shape of a userState and project for the create or update
 * @param {Object} propSets.userState Object matching the shape of a userState.
 * @param {Object} propSets.userState.data The data to mutate. For updates any array in data will replace that
 * on the server, but otherwise this data is deep merged with the existing data on the server
 * @param {Object} propSets.userProject Object matching the shape of userState.data[*}.userProject
 * @param {Object} propSets.userProject.project Object matching the shape of the project to mutate in the user state
 * @param {Number} propSets.userProject.project.id Required id of the project to update or add in userState.data.userProjects
 * @returns {Task|Just} A container. For ApolloClient mutations we get a Task back. For Apollo components
 * we get a Just.Maybe back. In the future the latter will be a Task when Apollo and React enables async components
 */
export const userStateProjectMutationContainer = v(R.curry((apolloConfig, {userProjectOutputParams}, propSets) => {
    const scopeName = 'project';
    return makeUserStateScopeObjsMutationContainer(
      apolloConfig,
      {
        scopeName,
        scopeQueryContainer: makeProjectsQueryContainer,
        readInputTypeMapper,
        userStateOutputParamsCreator: scopeOutputParams => {
          return userStateOutputParamsCreator(
            userScopeOutputParamsFragmentDefaultOnlyIds(scopeName, scopeOutputParams)
          );
        },
        userScopeOutputParams: userProjectOutputParams
      },
      R.compose(
        propSets => renameKey(R.lensPath([]), 'userProject', 'userScope', propSets),
        propSets => R.over(R.lensPath(['userProject', 'project']), project => {
          return filterOutReadOnlyVersionProps(project)
        }, propSets)
      )(propSets)
    );
  }), [
    ['apolloConfig', PropTypes.shape().isRequired],
    ['mutationStructure', PropTypes.shape({
      userProjectOutputParams: PropTypes.shape().isRequired
    })],
    ['props', PropTypes.shape({
      userState: PropTypes.shape().isRequired,
      userProject: PropTypes.shape({
        project: PropTypes.shape({
          id: PropTypes.number.isRequired
        })
      }).isRequired
    }).isRequired]
  ],
  'userStateProjectMutationContainer'
);