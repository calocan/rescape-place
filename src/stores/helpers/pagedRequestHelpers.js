/**
 * Created by Andy Likuski on 2018.04.25
 * Copyright (c) 2018 Andy Likuski
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
 */

import * as R from 'ramda';
import {containerForApolloType, makeQueryContainer} from 'rescape-apollo';
import {
  composeWithChainMDeep,
  composeWithMapMDeep,
  reqPathThrowing,
  reqStrPathThrowing,
  traverseReduceWhile
} from 'rescape-ramda';
import PropTypes from 'prop-types';
import {v} from 'rescape-validate';
import {loggers} from 'rescape-log';
import {of} from 'folktale/concurrency/task';

const log = loggers.get('rescapeDefault');

/**
 * Query objects paginated and return objects and the queryParams
 * @param {Object} config.apolloConfig The Apollo config
 * @param {Object} config.regionConfig Passed to t
 * @param {Function} [queryConfig.normalizeProps] Optional function that takes props and returns limited props
 * to pass to the query
 * @param {Object} queryConfig.outputParams The output params of the query. This is in the form
 * {
 *   pageSize,
 *   page,
 *   pages,
 *   hasNext,
 *   hasPrev,
 *   objects
 * }
 * @param {Object} queryConfig.propsStructure A structure of the props when using Apollo component
 * @param {Object} queryConfig.outputParams The output params of the query. This is in the form
 * @param {Object} props The props for the query. This must be in the form
 * {pageSize: the page size, page: the current page to request, objects: normal location props}
 * @return {Task|Maybe} A task or Maybe containing the locations and the queryParams
 */
export const queryObjectsPaginatedContainer = v(R.curry(
  (
    apolloConfig,
    {name, outputParams, readInputTypeMapper, normalizeProps},
    props
  ) => {
    return makeQueryContainer(
      apolloConfig,
      {name, readInputTypeMapper, outputParams},
      // Currently we don't support querying by objects.geojson, where objects is the location props
      R.over(
        R.lensProp('objects'),
        objs => {
          return (normalizeProps || R.identity)(objs);
        },
        props
      )
    );
  }),
  [
    ['apolloConfig', PropTypes.shape({apolloClient: PropTypes.shape()}).isRequired],
    ['queryConfig', PropTypes.shape({
      outputParams: PropTypes.array.isRequired
    })
    ],
    ['props', PropTypes.shape().isRequired]
  ], 'queryObjectsPaginatedContainer');

/**
 * Paginated query for locations
 * @param {Object} config
 * @param {Object} config.apolloConfig
 * @param {Object} config.regionConfig
 * @param {Object} queryConfig
 * @param {Object} queryConfig.outputParams Location outputParams (not the page)
 * @param {Object} queryConfig.pageSize
 * @param {Object} queryConfig.page
 * @param {Object} queryConfig.readInputTypeMapper Maps complex input types
 * @param {Function} [queryConfig.normalizeProps] Optionally takes props and limits what is passed to the query.
 * Default to passing everything
 * @param {Object} props
 * @return {Task | Maybe} resolving to the page of location results
 * @private
 */
export const _paginatedQueryContainer = (
  {apolloConfig, regionConfig},
  {name, outputParams, readInputTypeMapper, normalizeProps, pageSize, page},
  props
) => {
  return queryObjectsPaginatedContainer(
    apolloConfig,
    {
      name,
      outputParams: ['pageSize', 'page', 'pages', 'hasNext', 'hasPrev', {objects: outputParams}],
      readInputTypeMapper,
      normalizeProps
    },
    {pageSize, page, objects: props}
  );
};

/**
 * Queries for object using pagination
 * @type {function(): any}
 * @param {Object} config
 * @param {Object} config.apolloConfig
 * @param {Object} config.regionConfig
 * @param {String} queryConfig.paginatedObjectsName The name for the query
 * @param {Function} queryConfig.paginatedQueryContainer The query container function. This is passed most of the parameters
 * @param {Function} [queryConfig.filterObjsByConfig] Optional function to filter objects returned by pagination based on
 * the regionConfig
 * @param {Object} queryConfig.outputParams
 * @param {Object} queryConfig.readInputTypeMapper Maps complex input types
 * @param {Function} [queryConfig.normalizeProps] Optional function that takes props and limits what props are
 * passed to the query. Defaults to passing all of them
 */
export const queryUsingPaginationContainer = v(R.curry((
  {apolloConfig, regionConfig},
  {
    name, filterObjsByConfig, outputParams, readInputTypeMapper, normalizeProps
  },
  props
) => {
  const pageSize = 100;
  // We can't query geojson yet
  const limitedProps = R.omit(['geojson'], props);
  log.debug(`Checking for existence of objects with props ${JSON.stringify(limitedProps)}`);

  return composeWithChainMDeep(1, [
    // Extract the paginated objects, removing those that don't pass regionConfig's feature property filters
    objs => {
      return containerForApolloType(apolloConfig,
        R.when(R.identity, objs => {
            return filterObjsByConfig({regionConfig}, objs);
          }
        )(objs)
      );
    },

    firstPageObjs => {
      // Get the number of pages so we can query for the remaining pages if there are any
      const pageInfo = R.omit(['objects'], reqPathThrowing(['data', name], firstPageObjs));
      // Run a query for each page (based on the result of the first query)
      // TODO Should be traverseReduceWhile but there is a weird bug that causes it to resolve to a task
      return traverseReduceWhile({predicate: () => true, mappingFunction: R.chain},
        // Query for the page and extract the objects, since we don't need intermediate page info
        (previousResults, page) => {
          return _singlePageQueryContainer(
            {apolloConfig, regionConfig},
            {name, outputParams, readInputTypeMapper, normalizeProps, pageSize, page},
            {previousResults, firstPageLocations: firstPageObjs},
            limitedProps
          );
        },
        of([]),
        // Iterate the pages, 1-based index
        R.times(R.compose(of, R.add(1)), reqStrPathThrowing('pages', pageInfo))
      );
    },
    // Initial query determines tells us the number of pages
    page => {
      return _paginatedQueryContainer({apolloConfig, regionConfig}, {
          name,
          outputParams,
          pageSize,
          page,
          readInputTypeMapper,
          normalizeProps
        },
        limitedProps
      );
    }
  ])(1);
}), [
  ['config', PropTypes.shape(
    {
      apolloConfig: PropTypes.shape({
        apolloClient: PropTypes.shape().isRequired
      }).isRequired
    },
    {
      regionConfig: PropTypes.shape().isRequired
    }
  ).isRequired
  ],
  ['queryConfig', PropTypes.shape({
    outputParams: PropTypes.array.isRequired,
    propsStructure: PropTypes.shape()
  })
  ],
  ['props', PropTypes.shape().isRequired]
], 'queryLocationsUsingPaginationContainer');

/**
 * Queries for a single page of a paginated query
 * @param apolloConfig
 * @param regionConfig
 * @param name
 * @param paginatedQueryContainer
 * @param outputParams
 * @param propsStructure
 * @param pageSize
 * @param page
 * @param props
 * @param firstPageObjects
 * @param previousResults
 * @return {*}
 * @private
 */
export const _singlePageQueryContainer = (
  {apolloConfig, regionConfig},
  {name, outputParams, readInputTypeMapper, normalizeProps, pageSize, page},
  {firstPageLocations: firstPageObjects, previousResults},
  props
) => {
  return composeWithMapMDeep(1, [
    pageLocations => {
      // Combine the objects responses, ignoring the pagination data
      return R.concat(
        previousResults,
        reqPathThrowing(['data', name, 'objects'], pageLocations)
      );
    },
    page => {
      return R.ifElse(
        R.equals(1),
        // Use the first result for page 1
        () => {
          return of(firstPageObjects);
        },
        // Query for remaining pages
        page => {
          return _paginatedQueryContainer(
            {apolloConfig, regionConfig},
            {name, outputParams, readInputTypeMapper, normalizeProps, pageSize, page},
            props
          );
        }
      )(page);
    }
  ])(page);
};
