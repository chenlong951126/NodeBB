'use strict';


var async = require('async');
var validator = require('validator');
var winston = require('winston');

var user = require('../../user');
var groups = require('../../groups');
var plugins = require('../../plugins');
var meta = require('../../meta');
var utils = require('../../../public/src/utils');

var helpers = {};

helpers.getUserDataByUserSlug = function (userslug, callerUID, callback) {
	async.waterfall([
		function (next) {
			user.getUidByUserslug(userslug, next);
		},
		function (uid, next) {
			if (!uid) {
				return callback(null, null);
			}

			async.parallel({
				userData : function (next) {
					user.getUserData(uid, next);
				},
				userSettings : function (next) {
					user.getSettings(uid, next);
				},
				isAdmin : function (next) {
					user.isAdministrator(callerUID, next);
				},
				isGlobalModerator: function (next) {
					user.isGlobalModerator(callerUID, next);
				},
				isFollowing: function (next) {
					user.isFollowing(callerUID, uid, next);
				},
				ips: function (next) {
					user.getIPs(uid, 4, next);
				},
				profile_links: function (next) {
					plugins.fireHook('filter:user.profileLinks', [], next);
				},
				profile_menu: function (next) {
					plugins.fireHook('filter:user.profileMenu', {uid: uid, callerUID: callerUID, links: []}, next);
				},
				groups: function (next) {
					groups.getUserGroups([uid], next);
				},
				sso: function (next) {
					plugins.fireHook('filter:auth.list', {uid: uid, associations: []}, next);
				}
			}, next);
		},
		function (results, next) {
			if (!results.userData) {
				return callback(new Error('[[error:invalid-uid]]'));
			}

			var userData = results.userData;
			var userSettings = results.userSettings;
			var isAdmin = results.isAdmin;
			var isGlobalModerator = results.isGlobalModerator;
			var isSelf = parseInt(callerUID, 10) === parseInt(userData.uid, 10);

			userData.joindateISO = utils.toISOString(userData.joindate);
			userData.lastonlineISO = utils.toISOString(userData.lastonline || userData.joindate);
			userData.age = Math.max(0, userData.birthday ? Math.floor((new Date().getTime() - new Date(userData.birthday).getTime()) / 31536000000) : 0);

			userData.emailClass = 'hide';

			if (!(isAdmin || isGlobalModerator || isSelf || (userData.email && userSettings.showemail))) {
				userData.email = '';
			} else if (!userSettings.showemail) {
				userData.emailClass = '';
			}

			if (!isAdmin && !isGlobalModerator && !isSelf && !userSettings.showfullname) {
				userData.fullname = '';
			}

			if (isAdmin || isGlobalModerator || isSelf) {
				userData.ips = results.ips;
			}

			if (!isAdmin && !isGlobalModerator) {
				userData.moderationNote = undefined;
			}

			userData.uid = userData.uid;
			userData.yourid = callerUID;
			userData.theirid = userData.uid;
			userData.isAdmin = isAdmin;
			userData.isGlobalModerator = isGlobalModerator;
			userData.isAdminOrGlobalModerator = isAdmin || isGlobalModerator;
			userData.canBan = isAdmin || isGlobalModerator;
			userData.canChangePassword = isAdmin || (isSelf && parseInt(meta.config['password:disableEdit'], 10) !== 1);
			userData.isSelf = isSelf;
			userData.isFollowing = results.isFollowing;
			userData.showHidden = isSelf || isAdmin || isGlobalModerator;
			userData.groups = Array.isArray(results.groups) && results.groups.length ? results.groups[0] : [];
			userData.disableSignatures = meta.config.disableSignatures !== undefined && parseInt(meta.config.disableSignatures, 10) === 1;
			userData['reputation:disabled'] = parseInt(meta.config['reputation:disabled'], 10) === 1;
			userData['downvote:disabled'] = parseInt(meta.config['downvote:disabled'], 10) === 1;
			userData['email:confirmed'] = !!parseInt(userData['email:confirmed'], 10);
			userData.profile_links = filterLinks(results.profile_links.concat(results.profile_menu.links), isSelf);

			userData.sso = results.sso.associations;
			userData.status = user.getStatus(userData);
			userData.banned = parseInt(userData.banned, 10) === 1;
			userData.website = validator.escape(String(userData.website || ''));
			userData.websiteLink = !userData.website.startsWith('http') ? 'http://' + userData.website : userData.website;
			userData.websiteName = userData.website.replace(validator.escape('http://'), '').replace(validator.escape('https://'), '');
			userData.followingCount = parseInt(userData.followingCount, 10) || 0;
			userData.followerCount = parseInt(userData.followerCount, 10) || 0;

			userData.email = validator.escape(String(userData.email || ''));
			userData.fullname = validator.escape(String(userData.fullname || ''));
			userData.location = validator.escape(String(userData.location || ''));
			userData.signature = validator.escape(String(userData.signature || ''));
			userData.aboutme = validator.escape(String(userData.aboutme || ''));
			userData.birthday = validator.escape(String(userData.birthday || ''));
			userData.moderationNote = validator.escape(String(userData.moderationNote || ''));

			userData['cover:url'] = userData['cover:url'] || require('../../coverPhoto').getDefaultProfileCover(userData.uid);
			userData['cover:position'] = userData['cover:position'] || '50% 50%';
			userData['username:disableEdit'] = !userData.isAdmin && parseInt(meta.config['username:disableEdit'], 10) === 1;
			userData['email:disableEdit'] = !userData.isAdmin && parseInt(meta.config['email:disableEdit'], 10) === 1;

			next(null, userData);
		}
	], callback);
};


helpers.getBaseUser = function (userslug, callerUID, callback) {
	winston.warn('helpers.getBaseUser deprecated please use helpers.getUserDataByUserSlug');
	helpers.getUserDataByUserSlug(userslug, callerUID, callback);
};

function filterLinks(links, self) {
	return links.filter(function (link) {
		return link && (link.public || self);
	});
}

module.exports = helpers;
