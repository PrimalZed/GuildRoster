(function () {
    'use strict';

    angular.module('guildroster', [
        // Angular modules 

        // Custom modules 

        // 3rd Party Modules
        'LocalStorageModule'
    ]);
})();
(function () {
    'use strict';

    angular
        .module('guildroster')
        .filter('characterFilter', function () {
            return function (members, name, race, $class) {
                if (!members)
                    return members;

                // Clean up inputs
                name = name && name.toLowerCase();

                return members.filter(function (member) {
                    var character = member.character || member;

                    if (name) {
                        return character.name.toLowerCase().indexOf(name) != -1
                    }

                    return true;
                });
            };
        });
})();

(function () {
    'use strict';

    angular
        .module('guildroster')
        .constant('bnetApi', 'https://us.api.battle.net')
        .constant('bnetApiKey', 'z6axsap725bbqtaanxurfnkk2wemrzw7')
        .constant('wowRender', 'http://render-api-us.worldofwarcraft.com/static-render/us/');
})();

(function () {
    'use strict';

    angular
        .module('guildroster')
        .directive('guild', function () {
            return {
                templateUrl: 'lib/app/guild/guild.html',
                controller: guildController,
                controllerAs: 'vm',
                bindToController: true
            }
        });

    guildController.$inject = ['$scope', '$http', '$q', '$timeout', 'localStorageService', 'bnetApi', 'bnetApiKey', 'wowRender']; 

    function guildController($scope, $http, $q, $timeout, localStorageService, bnetApi, bnetApiKey, wowRender) {
        var vm = this;

        $scope.isRecent = function (date) {
            return ((new Date() - date) / (1000 * 60 * 60 * 24)) < 365;
        };

        var deadMembers = localStorageService.get('ded') || [];

        // Load Classes
        $http.get(bnetApi + '/wow/data/character/classes?locale=en_US&apikey=' + bnetApiKey)
            .then(function (response) {
                vm.classes = vm.classes || {};
                angular.forEach(response.data.classes, function ($class) {
                    vm.classes[$class.id] = $class.name;
                });
            });

        // Load Races
        $http.get(bnetApi + '/wow/data/character/races?locale=en_US&apikey=' + bnetApiKey)
            .then(function (response) {
                vm.races = vm.races || {};
                angular.forEach(response.data.races, function (race) {
                    vm.races[race.id] = race.name;
                });
            });

        var cachebusting = ''
        // Load Roster
        function load() {
            vm.errors = [];
            $http.get(bnetApi + '/wow/guild/Shadow-Council/Swiftstride Clan?fields=members&locale=en_US&apikey=' + bnetApiKey + '&_=' + cachebusting)
                // Get members array
                .then(function (response) {
                    return response.data.members;
                })
                // Check if members are dead
                .then(function (members) {
                    return members.map(function (member) {
                        member.character.isDead = deadMembers.indexOf(member.character.name) != -1;
                        return member;
                    });
                })
                // Map image urls
                .then(function (members) {
                    return members.map(function (member) {
                        if (member.character.isDead)
                            return member;

                        member.character.profileUrl = wowRender + member.character.thumbnail.replace("avatar", "profilemain") + "?alt=/wow/static/images/2d/profilemain/race/" + member.character.race + "-" + member.character.gender + ".jpg";
                        member.character.bustUrl = wowRender + member.character.thumbnail.replace("avatar", "inset") + "?alt=/wow/static/images/2d/inset/" + member.character.race + "-" + member.character.gender + ".jpg";
                        member.character.thumbnailUrl = wowRender + member.character.thumbnail + "?alt=/wow/static/images/2d/avatar/" + member.character.race + "-" + member.character.gender + ".jpg";
                        if (member.character.spec) {
                            member.character.spec.iconUrl = "http://us.media.blizzard.com/wow/icons/56/" + member.character.spec.icon + ".jpg";
                        }

                        return member;
                    });
                })
                // Set members to VM
                .then(function (members) {
                    vm.members = members;
                })
                // Refresh Last Modified
                .then(function () {
                    var callsPerSecond = 20;
                    return (function updateMembers() {
                        var members = vm.members.filter(function (m) { return !m.character.lastModified && !m.character.isDead; }).slice(0, callsPerSecond);
                        if (!members.length) {
                            return;
                        }

                        var memberPromises = [];
                        angular.forEach(members, function (member) {
                            memberPromises.push(
                                $http.get(bnetApi + '/wow/character/shadow-council/' + member.character.name + '?locale=en_US&apikey=' + bnetApiKey + '&_=' + cachebusting)
                                    .then(function (characterResponse) {
                                        if (!characterResponse.data.lastModified) {
                                            member.character.isDead = true;
                                            throw member.character.name + " did not return any data";
                                        }

                                        member.character.lastModified = characterResponse.data.lastModified;
                                        member.character.lastModifiedDate = new Date(member.character.lastModified);
                                    })
                                    .catch(function (characterError) {
                                        if (characterError.status == 404) {
                                            member.character.isDead = true;
                                        }
                                        else if (characterError.status == 503 || characterError.status == 504) {
                                            vm.errors.push(member.character.name + ': ' +characterError.status + '(' + characterError.statusText + ')');
                                        }
                                    })
                            );
                        });

                        memberPromises.push($timeout(null, 1200));

                        return $q.all(memberPromises)
                            .then(function () {
                                return updateMembers();
                            });
                    })();
                })
                // Save dead members to local storage
                .then(function () {
                    deadMembers = vm.members.filter(function (m) { return m.character.isDead; }).map(function (m) { return m.character.name; });
                    localStorageService.set('ded', deadMembers);
                });
        }
        load();

        vm.fullReset = function () {
            cachebusting = Date.now();
            deadMembers = [];
            load();
        }
        vm.clearDead = function () {
            deadMembers = [];
            load();
        }
    }
})();
