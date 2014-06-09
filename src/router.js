var ng = require('ng');

var router = function (
  routes, permissions, $injector, $location, $rootScope, KLOY_ROUTER_EVENTS,
  $log, $q, kloyRoute
) {

  var def = {}, checkPermissions, checkParams, doPrefetch,
      startEvent = KLOY_ROUTER_EVENTS.ROUTE_CHANGE_START,
      successEvent = KLOY_ROUTER_EVENTS.ROUTE_CHANGE_SUCCESS,
      errorEvent = KLOY_ROUTER_EVENTS.ROUTE_CHANGE_ERROR,
      isPaused = false;

  checkPermissions = function (permissionNames) {

    var stubPermission, allPermissions = [];
    permissionNames = permissionNames || [];

    stubPermission = $q.defer();
    stubPermission.resolve();
    allPermissions.push(stubPermission.promise);

    permissionNames.forEach(function (permissionName) {

      var permissionFn, promise;

      permissionFn = permissions[permissionName];

      if (! ng.isFunction(permissionFn)) {
        throw "router.checkPermissions(): unknown permission " +
          permissionName;
      }

      try {
        promise = $injector.invoke(permissionFn);
      } catch (err) {
        $log.error(
          'router.checkPermissions(): problem invoking permission',
          err
        );
        throw err;
      }

      allPermissions.push(promise);
    });

    return $q.all(allPermissions);
  };

  checkParams = function (params, requiredParams) {

    var dfd = $q.defer(),
        missingParams = [];

    params = params || {};

    if (! ng.isArray(requiredParams)) {
      dfd.resolve();
      return dfd.promise;
    }

    requiredParams.forEach(function (name) {

      if (name in params) { return; }

      missingParams.push(name);
    });

    if (missingParams.length) {

      return $q.reject('missing required param(s) ' + missingParams.join(', '));
    }

    dfd.resolve();
    return dfd.promise;
  };

  doPrefetch = function (prefetchFn) {

    var prefetching, dfd;

    if (ng.isUndefined(prefetchFn)) {
      dfd = $q.defer();
      dfd.resolve();
      return dfd.promise;
    }
    else if (! ng.isFunction(prefetchFn)) {
      throw "router.prefetch(): argument must be a function or undefined";
    }

    try {
        prefetching = $injector.invoke(prefetchFn);
      } catch (err) {
      $log.error(
        'router.doPrefetch(): problem invoking prefetch',
        err
      );
      throw err;
    }

    return prefetching;
  };

  def.go = function (routeName, params) {

    var helpers, configFns, permissions, promise, msg, requiredParams,
        prefetchFn, previousErr, routeData;

    configFns = routes[routeName];

    if (! ng.isArray(configFns)) {
      throw 'router.go() unknown route ' + routeName;
    }

    if (isPaused) {
      msg = 'router.go(): paused, cannot go to ' + routeName;
      $log.debug(msg);
      return $q.reject(msg);
    }

    $rootScope.$broadcast(startEvent, routeName, kloyRoute);

    helpers = {
      permissions: function (listOfPermissions) {

        if (ng.isDefined(listOfPermissions)) {
          permissions = listOfPermissions;
        }

        return permissions;
      },
      requireParams: function (params) {

        if (ng.isDefined(params)) {
          requiredParams = params;
        }

        return requiredParams;
      },
      prefetch: function (fn) {

        if (ng.isDefined(fn)) {
          prefetchFn = fn;
        }

        return prefetchFn;
      },
      data: function (obj) {

        if (ng.isDefined(obj)) {
          routeData = ng.copy(obj);
        }

        return routeData;
      }
    };

    configFns.forEach(function (configFn) {

      configFn.bind(helpers)();
    });

    previousErr = false;
    promise = checkPermissions(permissions).
      then(
        function () {

          return checkParams(params, requiredParams);
        },
        function (err) {

          if (previousErr) { return $q.reject(err); }

          $log.debug('router.go(): permissions error', err, routeName);
          $rootScope.$broadcast(
            errorEvent,
            {
              message: err,
              type: 'permissions'
            },
            routeName,
            kloyRoute
          );
          previousErr = true;

          return $q.reject(err);
        }
      ).
      then(
        function () {

          return doPrefetch(prefetchFn);
        },
        function (err) {

          if (previousErr) { return $q.reject(err); }

          $log.debug('router.go(): params error', err, routeName);
          $rootScope.$broadcast(
            errorEvent,
            {
              message: err,
              type: 'params'
            },
            routeName,
            kloyRoute
          );
          previousErr = true;

          return $q.reject(err);
        }
      ).
      then(
        null,
        function (err) {

          if (previousErr) { return $q.reject(err); }

          $log.debug('router.go(): prefetch error', err, routeName);
          $rootScope.$broadcast(
            errorEvent,
            {
              message: err,
              type: 'prefetch'
            },
            routeName,
            kloyRoute
          );
          previousErr = true;

          return $q.reject(err);
        }
      ).
      then(
        function (data) {

          kloyRoute._update({
            params: params,
            name: routeName,
            data: routeData
          });

          // All went well, broadcast success event
          $rootScope.$broadcast(successEvent, routeName, kloyRoute);

          return data;
        }
      );

    return promise;
  };

  def.pause = function () {

    isPaused = true;

    return def;
  };

  def.play = function () {

    isPaused = false;

    return def;
  };

  return def;
};

var routerProvider = function () {

  var def = {}, routes = {}, permissions = {};

  def.addRoute = function (name, configFn) {

    if (name in routes) {
      throw 'routerProvider.addRoute() route already defined ' + name;
    }

    routes[name] = [configFn];

    return def;
  };

  def.modifyRoute = function (name, configFn) {

    if (ng.isUndefined(routes[name])) {
      throw 'routerProvider.modifyRoute() route not defined ' + name;
    }

    routes[name].push(configFn);

    return def;
  };

  def.addPermission = function (name, configFn) {

    if (name in permissions) {
      throw "routerProvider.addPermission(): permission already defined";
    }

    permissions[name] = configFn;

    return def;
  };

  def.$get = /*@ngInject*/function (
    $injector, $location, $rootScope, KLOY_ROUTER_EVENTS, $log, $q, kloyRoute
  ) {

    return router(
      routes,
      permissions,
      $injector,
      $location,
      $rootScope,
      KLOY_ROUTER_EVENTS,
      $log,
      $q,
      kloyRoute
    );
  };

  return def;
};

module.exports = routerProvider;
