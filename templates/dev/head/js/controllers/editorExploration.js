// Copyright 2012 Google Inc. All Rights Reserved.
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//      http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS-IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

/**
 * @fileoverview Angular controllers for elements on an editor's exploration page.
 *
 * @author sll@google.com (Sean Lip)
 */

var END_DEST = 'END';
var QN_DEST_PREFIX = 'q-';
// TODO(sll): Internationalize these.
var GUI_EDITOR_URL = '/gui';
var YAML_EDITOR_URL = '/text';

// TODO(sll): Move all strings to the top of the file, particularly
// warning messages and activeInputData.name.
// TODO(sll): console.log is not supported in IE. Fix before launch.

oppia.config(['$routeProvider', function($routeProvider) {
  $routeProvider.
      when(YAML_EDITOR_URL + '/:stateId',
           {templateUrl: '/templates/yaml', controller: YamlEditor}).
      when(GUI_EDITOR_URL + '/:stateId',
           {templateUrl: '/templates/gui', controller: GuiEditor}).
      when('/', {templateUrl: '/templates/gui', controller: ExplorationTab}).
      otherwise({redirectTo: '/'});
}]);

oppia.factory('explorationData', function($rootScope, $http, $resource, warningsData) {
  // Put exploration variables here.
  var explorationData ={};

  // Valid state properties
  var validStateProperties = [
    'content',
    'interactive_widget',
    'interactive_params',
    'interactive_rulesets',
    'param_changes',
    'state_name',
    'yaml_file'
  ];

  // The pathname should be: .../create/{exploration_id}[/{state_id}]
  var explorationUrl = '/create/' + pathnameArray[2];

  // There should be one GET request made for an exploration when the editor page
  // is initially loaded. This results in a broadcast that will initialize the
  // relevant frontend controllers.
  // Any further GET requests will be state-specific and will be obtained by
  // calling getStateData(stateId).
  // Thereafter, any updates to the model would be PUT by calling
  // saveStateData(). This would send a PUT request to the backend to update the
  // backend model. On success, it will update the model stored here, too.

  // TODO(sll): Find a fix for multiple users editing the same exploration
  // concurrently.

  explorationData.getData = function() {
    // Retrieve data from the server.
    console.log('Retrieving exploration data from the server');

    $http.get(explorationUrl + '/data').success(
      function(data) {
        explorationData.data = data;
        explorationData.broadcastExploration();
      }).error(function(errorResponse) {
        warningsData.addWarning('Server error: ' + errorResponse.error);
      });
  };

  explorationData.broadcastExploration = function() {
    console.log(explorationData);
    $rootScope.$broadcast('explorationData');
  };

  explorationData.broadcastState = function(stateId) {
    if (!stateId) {
      return;
    }
    explorationData.stateId = stateId;
    console.log('Broadcasting data for state ' + explorationData.stateId);
    $rootScope.$broadcast('explorationData');
  };

  explorationData.getStateData = function(stateId) {
    if (!stateId) {
      return;
    }
    console.log('Getting state data for state ' + stateId);
    explorationData.stateId = stateId;
    if ('states' in explorationData.data && stateId in explorationData.data.states) {
      return explorationData.data.states[stateId];
    } else {
      explorationData.getData();
      return explorationData.data.states[stateId];
    }
  };

  explorationData.getStateProperty = function(stateId, property) {
    if (!stateId) {
      return;
    }
    // NB: This does not broadcast an event.
    console.log(
        'Getting state property ' + property + ' for state ' + stateId);
    var stateData = explorationData.getStateData(stateId);
    if (!stateData) {
      warningsData.addWarning('Cannot get data for state ' + stateId);
      return;
    }
    if (!stateData.hasOwnProperty(property)) {
      warningsData.addWarning('Invalid property name: ' + property);
      return;
    }
    return stateData[property];
  };

  // Saves data for a given state to the backend, and, on a success callback,
  // updates the data for that state in the frontend and broadcasts an
  // 'state updated' event.
  explorationData.saveStateData = function(stateId, propertyValueMap) {
    for (var property in propertyValueMap) {
      if (validStateProperties.indexOf(property) < 0) {
        warningsData.addWarning('Invalid property name: ' + property);
        return;
      }
      propertyValueMap[property] = JSON.stringify(propertyValueMap[property]);
    }

    var request = $.param(propertyValueMap, true);

    $http.put(
        explorationUrl + '/' + stateId + '/data',
        request,
        {headers: {'Content-Type': 'application/x-www-form-urlencoded'}}
    ).success(function(data) {
      warningsData.clear();
      console.log('Changes to this state were saved successfully.');
      explorationData.data['states'][stateId] = data;
      explorationData.broadcastState(stateId);
    }).error(function(data) {
      warningsData.addWarning(data.error || 'Error communicating with server.');
    });
  };

  return explorationData;
});

// Receive events from the iframed widget repository.
oppia.run(function($rootScope) {
  window.addEventListener('message', function(event) {
    $rootScope.$broadcast('message', event);
  });
});


function ExplorationTab($scope) {
  // Changes the tab to the Exploration Editor view.
  $('#editorViewTab a[href="#explorationEditor"]').tab('show');
}

function EditorExploration($scope, $http, $location, $route, $routeParams,
    explorationData, warningsData, activeInputData) {

  $scope.saveStateName = function() {
    if (!$scope.isValidEntityName($scope.stateName, true))
      return;
    if ($scope.isDuplicateInput(
            $scope.states, 'name', $scope.stateId, $scope.stateName)) {
      warningsData.addWarning(
          'The name \'' + $scope.stateName + '\' is already in use.');
      return;
    }

    explorationData.saveStateData(
        $scope.stateId, {'state_name': $scope.stateName});
    activeInputData.clear();
  };


  /********************************************
  * Methods affecting the URL location hash.
  ********************************************/
  /**
   * Gets the current mode from the URL location hash, with the GUI mode being
   * the default.
   */
  $scope.getMode = function() {
    if ($location.$$url.substring(0, YAML_EDITOR_URL.length) == YAML_EDITOR_URL) {
      return YAML_EDITOR_URL.substring(1);
    } else {
      return GUI_EDITOR_URL.substring(1);
    }
  };

  /**
   * Changes the state editor mode.
   * @param {string} mode The state editor mode to switch to (currently, gui or text).
   */
  $scope.changeMode = function(mode) {
    if (mode == GUI_EDITOR_URL.substring(1)) {
      $location.path(GUI_EDITOR_URL + '/' + explorationData.stateId);
    } else if (mode == YAML_EDITOR_URL.substring(1)) {
      $location.path(YAML_EDITOR_URL + '/' + explorationData.stateId);
    } else {
      warningsData.addWarning('Error: mode ' + mode + ' doesn\'t exist.');
    }
    $scope.$apply();
  };

  // Changes the location hash when the editorView tab is changed.
  $('#editorViewTab a[data-toggle="tab"]').on('shown', function (e) {
    if (e.target.hash == '#stateEditor') {
      explorationData.broadcastState(explorationData.stateId);
      $scope.changeMode($scope.getMode());
    } else {
      $location.path('');
      explorationData.getData();
    }
  });


  /**********************************************************
   * Called on initial load of the exploration editor page.
   *********************************************************/
  var explorationFullyLoaded = false;

  // The pathname should be: .../create/{exploration_id}[/{state_id}]
  $scope.explorationId = pathnameArray[2];
  $scope.explorationUrl = '/create/' + $scope.explorationId;

  // Initializes the exploration page using data from the backend.
  explorationData.getData();

  $scope.$on('explorationData', function() {
    var data = explorationData.data;
    $scope.stateId = explorationData.stateId;
    $scope.states = data.states;
    $scope.explorationImageId = data.image_id;
    $scope.explorationTitle = data.title;
    $scope.explorationCategory = data.category;
    $scope.initStateId = data.init_state_id;
    $scope.isPublic = data.is_public;
    explorationFullyLoaded = true;

    if ($scope.stateId) {
      $scope.processStateData(explorationData.getStateData($scope.stateId));
    }
  });

  $scope.$watch('explorationCategory', function(newValue, oldValue) {
    $scope.saveExplorationProperty('explorationCategory', 'category', newValue, oldValue);
  });

  $scope.$watch('explorationTitle', function(newValue, oldValue) {
    $scope.saveExplorationProperty('explorationTitle', 'title', newValue, oldValue);
  });

  /**
   * Downloads the YAML representation of an exploration.
   */
  $scope.downloadExploration = function() {
    document.location = '/create/download/' + $scope.explorationId;
  };

  $scope.makePublic = function() {
    $scope.saveExplorationProperty('isPublic', 'is_public', true, false);
  };

  $scope.deleteExplorationImage = function() {
    $scope.saveExplorationProperty(
        'explorationImageId', 'image_id', null, $scope.explorationImageId);
  };

  $scope.saveExplorationImage = function() {
    activeInputData.clear();
    $scope.saveImage(function(data) {
      $scope.explorationImageId = data.image_id;
      $scope.saveExplorationProperty(
          'explorationImageId', 'image_id', $scope.explorationImageId, null);
    });
  };

  /**
   * Saves a property of an exploration (e.g. title, category, etc.)
   * @param {string} frontendName The frontend name of the property to save
   *     (e.g. explorationTitle, explorationCategory)
   * @param {string} backendName The backend name of the property (e.g. title, category)
   * @param {string} newValue The new value of the property
   * @param {string} oldValue The previous value of the property
   */
  $scope.saveExplorationProperty = function(frontendName, backendName, newValue, oldValue) {
    if (!explorationFullyLoaded) {
      return;
    }
    if (oldValue && !$scope.isValidEntityName($scope[frontendName], true)) {
      $scope[frontendName] = oldValue;
      return;
    }
    var requestParameters = {};
    requestParameters[backendName] = newValue;

    activeInputData.clear();

    var request = $.param(requestParameters, true);
    $http.put(
        $scope.explorationUrl,
        request,
        {headers: {'Content-Type': 'application/x-www-form-urlencoded'}}).
            success(function(data) {
              if (frontendName == 'isPublic' || frontendName == 'explorationImageId') {
                $scope[frontendName] = newValue;
              }
              console.log('PUT request succeeded');
            }).
            error(function(data) {
              warningsData.addWarning(
                  'Error modifying exploration properties: ' + data.error);
              $scope[frontendName] = oldValue;
            });
  };

  $scope.initializeNewActiveInput = function(newActiveInput) {
    // TODO(sll): Rework this so that in general it saves the current active
    // input, if any, first. If it is bad input, display a warning and cancel
    // the effects of the old change. But, for now, each case is handled
    // specially.
    console.log('Current Active Input: ' + activeInputData.name);
    if (activeInputData.name == 'stateName') {
      $scope.saveStateName();
    }

    var inputArray = newActiveInput.split('.');

    activeInputData.name = (newActiveInput || '');
    // TODO(sll): Initialize the newly displayed field.
  };

  // Adds a new state to the list of states, and updates the backend.
  $scope.addState = function(newStateName, successCallback) {
    if (!$scope.isValidEntityName(newStateName, true))
      return;
    if (newStateName.toUpperCase() == END_DEST) {
      warningsData.addWarning('Please choose a state name that is not \'END\'.');
      return;
    }
    for (var id in $scope.states) {
      if (id != $scope.stateId && $scope.states[id]['name'] == newStateName) {
        warningsData.addWarning('A state with this name already exists.');
        return;
      }
    }

    $http.post(
        $scope.explorationUrl,
        'state_name=' + newStateName,
        {headers: {'Content-Type': 'application/x-www-form-urlencoded'}}).
            success(function(data) {
              $scope.newStateDesc = '';
              explorationData.getData();
              if (successCallback) {
                successCallback(data);
              }
            }).error(function(data) {
              warningsData.addWarning(
                  'Server error when adding state: ' + data.error);
            });
  };

  $scope.$on('stateData', function() {
    $scope.stateId = explorationData.stateId;
    $scope.processStateData(explorationData.getStateData($scope.stateId));
  });

  /**
   * Sets up the state editor, given its data from the backend.
   * @param {Object} data Data received from the backend about the state.
   */
  $scope.processStateData = function(data) {
    $scope.stateId = explorationData.stateId;
    $scope.stateName = data.name;
  };

  $scope.getStateName = function(stateId) {
    if (!stateId) {
      return '[none]';
    }
    return explorationData.getStateProperty(stateId, 'name');
  };

  $scope.openDeleteStateModal = function(stateId) {
    $scope.deleteStateId = stateId;
    $scope.$apply();
    $('#deleteStateModal').modal('show');
  };

  $('#deleteStateModal').on('hidden', function() {
    $scope.deleteStateId = '';
  });

  // Deletes the state with id stateId. This action cannot be undone.
  $scope.deleteState = function(stateId) {
    if (stateId == $scope.initStateId) {
      warningsData.addWarning('Deleting the initial state of a question is not ' +
          'supported. Perhaps edit it instead?');
      return;
    }

    $http['delete']($scope.explorationUrl + '/' + stateId + '/data')
    .success(function(data) {
      // TODO(sll): Try and handle this without reloading the page.
      window.location = $scope.explorationUrl;
    }).error(function(data) {
      warningsData.addWarning(data.error || 'Error communicating with server.');
    });
  };

  $scope.deleteExploration = function() {
    $http['delete']($scope.explorationUrl)
    .success(function(data) {
      window.location = '/gallery/';
    });
  };
}

/**
 * Injects dependencies in a way that is preserved by minification.
 */
EditorExploration.$inject = ['$scope', '$http', '$location', '$route',
    '$routeParams', 'explorationData', 'warningsData', 'activeInputData'];
ExplorationTab.$inject = ['$scope'];
