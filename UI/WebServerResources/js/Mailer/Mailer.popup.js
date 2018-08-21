/* -*- Mode: javascript; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* JavaScript for SOGo.MailerUI module */

(function() {
  'use strict';

  angular.module('SOGo.MailerUI', ['ngCookies', 'ui.router', 'ck', 'angularFileUpload', 'SOGo.Common', 'SOGo.ContactsUI', 'SOGo.SchedulerUI', 'ngAnimate', 'SOGo.PreferencesUI'])
    .config(configure)
    .run(runBlock)
    .controller('MessageEditorControllerPopup', MessageEditorControllerPopup);

  /**
   * @ngInject
   */
  configure.$inject = ['$stateProvider', '$urlRouterProvider'];
  function configure($stateProvider, $urlRouterProvider) {
    $stateProvider
      .state('mail', {
        url: '/Mail',
        abstract: true,
        views: {
          message: {
            template: '<ui-view/>'
          }
        },
        resolve: {
          stateAccounts: stateAccounts
        }
      })
      .state('mail.account', {
        url: '/:accountId',
        abstract: true,
        template: '<ui-view id="account"/>',
        resolve: {
          stateAccount: stateAccount
        }
      })
      .state('mail.account.mailbox', {
        url: '/:mailboxId',
        abstract: true,
        template: '<ui-view id="mailbox"/>',
        resolve: {
          stateMailbox: stateMailbox
        }
      })
      .state('mail.account.mailbox.newMessage', {
        url: '/new',
        views: {
          'message@': {
            template: '<ui-view/>',
            controller: 'MessageEditorControllerPopup'
          }
        },
        resolve: {
          stateMessage: stateNewMessage
        }
      })
      .state('mail.account.mailbox.message', {
        url: '/:messageId',
        views: {
          'message@': {
            templateUrl: 'UIxMailViewTemplate', // UI/Templates/MailerUI/UIxMailViewTemplate.wox
            controller: 'MessageController',
            controllerAs: 'viewer'
          }
        },
        resolve: {
          stateMessage: stateMessage
        }
      })
      .state('mail.account.mailbox.message.edit', {
        url: '/edit',
        views: {
          'message@': {
            template: '<ui-view/>',
            controller: 'MessageEditorControllerPopup'
          }
        },
        resolve: {
          stateContent: stateContent
        }
      })
      .state('mail.account.mailbox.message.action', {
        url: '/{actionName:(?:reply|replyall|forward)}',
        views: {
          'message@': {
            template: '<ui-view/>',
            controller: 'MessageEditorControllerPopup'
          }
        }
      });

    // if none of the above states are matched, use this as the fallback
    $urlRouterProvider.otherwise('/Mail/0/folderINBOX/new');
  }

  /**
   * @ngInject
   */
  stateAccounts.$inject = ['$window', '$q', 'Account'];
  function stateAccounts($window, $q, Account) {
    var accounts, promises = [];

    if ($window &&
        $window.opener &&
        $window.opener.$mailboxController) {
      // Mail accounts are available from the parent window
      accounts = $window.opener.$mailboxController.accounts;
      return $q.when(accounts);
    }
    else {
      return Account.$findAll().then(function(accounts) {
        // Fetch list of mailboxes for each account
        angular.forEach(accounts, function(account, i) {
          var mailboxes = account.$getMailboxes();
          if (i === 0)
            // Make sure we have the list of mailboxes of the first account
            promises.push(mailboxes.then(function(objects) {
              return account;
            }));
          else
            // Don't wait for external accounts
            promises.push(account);
        });
        return $q.all(promises);
      });
    }
  }

  /**
   * @ngInject
   */
  stateAccount.$inject = ['$stateParams', 'stateAccounts'];
  function stateAccount($stateParams, stateAccounts) {
    return _.find(stateAccounts, function(account) {
      return account.id == $stateParams.accountId;
    });
  }

  /**
   * @ngInject
   */
  stateMailbox.$inject = ['$q', '$state', '$stateParams', 'stateAccount', 'decodeUriFilter', 'Mailbox'];
  function stateMailbox($q, $state, $stateParams, stateAccount, decodeUriFilter, Mailbox) {
    var mailbox,
        mailboxId = decodeUriFilter($stateParams.mailboxId),
        _find;

    // Recursive find function
    _find = function(mailboxes) {
      var mailbox = _.find(mailboxes, function(o) {
        return o.path == mailboxId;
      });
      if (!mailbox) {
        angular.forEach(mailboxes, function(o) {
          if (!mailbox && o.children && o.children.length > 0) {
            mailbox = _find(o.children);
          }
        });
      }
      return mailbox;
    };

    mailbox = _find(stateAccount.$mailboxes);

    if (mailbox) {
      mailbox.$topIndex = 0;
      mailbox.selectFolder();
      return mailbox;
    }
    else
      // Mailbox not found
      return $q.reject("Mailbox doesn't exist");
  }

  /**
   * @ngInject
   */
  stateNewMessage.$inject = ['$urlService', 'stateAccount'];
  function stateNewMessage($urlService, stateAccount) {
    var mailto, params = $urlService.search();
    if (params) {
      mailto = _.find(_.keys(params), function(k) {
        return /^mailto:/i.test(k);
      });
    }
    return stateAccount.$newMessage({ mailto: mailto });
  }

  /**
   * @ngInject
   */
  stateMessage.$inject = ['encodeUriFilter', '$q', '$stateParams', '$state', 'stateMailbox', 'Message'];
  function stateMessage(encodeUriFilter, $q, $stateParams, $state, stateMailbox, Message) {
    var data, message;

    if (window &&
        window.opener &&
        window.opener.$messageController &&
        window.opener.$messageController.message.uid == parseInt($stateParams.messageId)) {
      // Message is available from the parent window
      message = new Message(stateMailbox.$account.id,
                            stateMailbox,
                            window.opener.$messageController.message.$omit({privateAttributes: true}));
      return $q.when(message);
    }
    else {
      // Message is not available; load it from the server
      data = { uid: $stateParams.messageId.toString() };
      message = new Message(stateMailbox.$account.id, stateMailbox, data);
      return message.$reload();
    }
  }

  /**
   * @ngInject
   */
  stateContent.$inject = ['stateMessage'];
  function stateContent(stateMessage) {
    return stateMessage.$editableContent();
  }

  /**
   * @ngInject
   */
  runBlock.$inject = ['$window', '$rootScope', '$log'];
  function runBlock($window, $rootScope, $log) {
    $rootScope.$on('$stateChangeError', function(event, toState, toParams, fromState, fromParams, error) {
      $log.error(error);
      $window.close();
    });
    $rootScope.$on('$routeChangeError', function(event, current, previous, rejection) {
      $log.error(event, current, previous, rejection);
    });
  }

  /**
   * @ngInject
   */
  MessageEditorControllerPopup.$inject = ['$window', '$q', '$mdDialog', 'stateAccount', 'stateMessage'];
  function MessageEditorControllerPopup($window, $q, $mdDialog, stateAccount, stateMessage) {
    var onCompleteDeferred = $q.defer();
    $mdDialog
      .show({
        hasBackdrop: false,
        disableParentScroll: false,
        clickOutsideToClose: false,
        escapeToClose: false,
        templateUrl: 'UIxMailEditor',
        controller: 'MessageEditorController',
        controllerAs: 'editor',
        onComplete: function (scope, element) {
          return onCompleteDeferred.resolve(element);
        },
        locals: {
          stateAccount: stateAccount,
          stateMessage: stateMessage,
          onCompletePromise: function () {
            return onCompleteDeferred.promise;
          }
        }
      })
      .finally(function() {
        $window.close();
      });
  }
  
})();
