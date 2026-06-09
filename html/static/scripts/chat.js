var Chat = {
	socket: null,

	loading: document.getElementById("loading"),
	chat_box: document.getElementById("chat-box"),
	msgs_list: document.getElementById("msgs"),
	typing_list: document.getElementById("typing"),
	users: document.getElementById("users"),
	room_list: document.getElementById("room-list"),
	create_room_btn: document.getElementById("create-room"),
	create_room_form: document.getElementById("create-room-form"),
	room_name: document.getElementById("room-name"),
	room_error: document.getElementById("room-error"),
	room_submit: document.getElementById("room-submit"),
	room_cancel: document.getElementById("room-cancel"),
	active_room_name: document.getElementById("active-room-name"),
	login_modal: document.getElementById("login-modal"),
	login_nick: document.getElementById("login-nick"),
	login_error: document.getElementById("login-error"),
	login_submit: document.getElementById("login-submit"),
	textarea: document.getElementById("form_input"),
	send_btn: document.getElementById("send"),

	is_focused: false,
	is_online: false,
	is_typing: false,
	last_sent_nick: null,
	current_room_id: null,
	rooms: [],

	original_title: document.title,
	new_title: "有新消息...",

	scroll: function(){
		setTimeout(function(){
			Chat.chat_box.scrollTop = Chat.chat_box.scrollHeight;
		}, 0)
	},

	notif: {
		enabled: true,

		toggle: function(){
			return Chat.notif.enabled = !Chat.notif.enabled;
		},

		// Title time-out
		ttout: undefined,

		active: undefined,
		msgs: 0,

		// Beep notification
		beep: undefined,
		beep_create: function(){
			var audiotypes = {
				"mp3": "audio/mpeg",
				"mp4": "audio/mp4",
				"ogg": "audio/ogg",
				"wav": "audio/wav"
			};

			var audios = [
				'static/beep.ogg'
			];

			var audio_element = document.createElement('audio');
			if(audio_element.canPlayType){
				for(var i = 0;i < audios.length;i++){
					var source_element = document.createElement('source');
					source_element.setAttribute('src', audios[i]);
					if(audios[i].match(/\.(\w+)$/i)){
						source_element.setAttribute('type', audiotypes[RegExp.$1]);
					}
					audio_element.appendChild(source_element);
				}

				audio_element.load();
				audio_element.playclip = function(){
					audio_element.pause();
					audio_element.volume = 0.5;
					audio_element.currentTime = 0;
					audio_element.play();
				};

				return audio_element;
			}
		},

		// Create new notification
		create: function(from, message){
			// If is focused, no notification
			if(Chat.is_focused || !Chat.notif.enabled){
				return;
			}

			// Increase number in title
			Chat.notif.msgs++;

			// Create new ttout, if there is not any
			Chat.notif.favicon('blue');
			document.title = '(' + Chat.notif.msgs + ') ' + Chat.new_title;

			if(typeof Chat.notif.ttout === "undefined"){
				Chat.notif.ttout = setInterval(function(){
					if(document.title == Chat.original_title){
						Chat.notif.favicon('blue');
						document.title = '(' + Chat.notif.msgs + ') ' + Chat.new_title;
					} else {
						Chat.notif.favicon('green');
						document.title = Chat.original_title;
					}
				}, 1500);
			}

			// Do beep
			Chat.notif.beep.playclip();

			// If are'nt allowed notifications
			if(Notification.permission !== "granted"){
				Notification.requestPermission();
				return;
			}

			// Clear notification
			Chat.notif.clear();

			// Strip tags
			from = from.replace(/(<([^>]+)>)/ig, "");
			message = message.text?.replace(/(<([^>]+)>)/ig, "");

			// Create new notification
			Chat.notif.active = new Notification(from, {
				icon: 'static/images/favicon-blue.png',
				//timeout: 10,
				body: message,
			});

			// On click, focus this window
			Chat.notif.active.onclick = function(){
				parent.focus();
				window.focus();
			};
		},

		// Clear notification
		clear: function(){
			typeof Chat.notif.active === "undefined" || Chat.notif.active.close();
		},

		favicon: function(color){
			var link = document.querySelector("link[rel*='icon']") || document.createElement('link');
			link.type = 'image/x-icon';
			link.rel = 'shortcut icon';
			link.href = 'static/images/favicon-' + color + '.ico';
			document.getElementsByTagName('head')[0].appendChild(link);
		}
	},

	send_msg: function(text){
		Chat.socket.emit("send-msg", {
			m: text
		});
	},

	send_event: function(){
		var value = Chat.textarea.value.trim();
		if(value == "") return;

		console.log("Send message.");

		Chat.send_msg({text: value});

		Chat.textarea.value = '';
		Chat.typing.update();
		Chat.textarea.focus();
	},

	clear_room_view: function(){
		Chat.msgs_list.innerText = '';
		Chat.typing_list.innerText = '';
		Chat.users.innerText = '';
		Chat.user.objects = {};
		Chat.typing.objects = {};
		Chat.last_sent_nick = '';
	},

	create_room_event: function(){
		Chat.room_error.innerText = '';
		Chat.create_room_form.hidden = false;
		Chat.room_name.focus();
	},

	submit_room_event: function(){
		var name = Chat.room_name.value.trim();
		if(name == ""){
			Chat.room_error.innerText = "请输入聊天组名称。";
			return;
		}

		Chat.socket.emit("create-room", {
			name: name
		});
	},

	cancel_room_event: function(){
		Chat.room_name.value = '';
		Chat.room_error.innerText = '';
		Chat.create_room_form.hidden = true;
	},

	switch_room: function(roomId){
		if(!roomId || roomId === Chat.current_room_id){
			return;
		}

		Chat.socket.emit("join-room", {
			roomId: roomId
		});
	},

	render_rooms: function(data){
		Chat.rooms = data.rooms || [];
		Chat.room_list.innerText = '';

		Chat.rooms.forEach(function(room){
			var item = document.createElement('li');
			var button = document.createElement('button');
			button.type = 'button';
			button.innerText = room.name + ' (' + room.count + ')';
			button.onclick = function(){
				Chat.switch_room(room.id);
			};

			if(room.id === Chat.current_room_id){
				button.className = 'active';
			}

			item.appendChild(button);
			Chat.room_list.appendChild(item);
		});
	},

	typing: {
		objects: {},

		create: function(nick){
			var li = document.createElement('li');

			var prefix = document.createElement('span');
			prefix.className = 'prefix';
			prefix.innerText = nick;
			li.appendChild(prefix);

			var msg = document.createElement('div');
			msg.className = 'message';

			var body = document.createElement('span');
			body.className = 'body writing'
			body.innerHTML = '<span class="one">&bull;</span><span class="two">&bull;</span><span class="three">&bull;</span>';
			msg.appendChild(body);

			li.appendChild(msg);

			Chat.typing_list.appendChild(li);

			Chat.typing.objects[nick] = li;

			// Scroll to new message
			Chat.scroll();
		},

		remove: function(nick){
			if(Chat.typing.objects.hasOwnProperty(nick)){
				var element = Chat.typing.objects[nick];
				element.parentNode.removeChild(element);
				delete Chat.typing.objects[nick];
			}
		},

		event: function(r){
			if(r.status){
				Chat.typing.create(r.nick);
			} else {
				Chat.typing.remove(r.nick);
			}
		},

		update: function(){
			if(Chat.is_typing && Chat.textarea.value === ""){
				Chat.socket.emit("typing", Chat.is_typing = false);
			}

			if(!Chat.is_typing && Chat.textarea.value !== ""){
				Chat.socket.emit("typing", Chat.is_typing = true);
			}
		}
	},

	new_msg: function(r){
		console.log("New message.");
		const fromSelf = sessionStorage.nick == r.f;

		// Notify user
		if(!fromSelf){
			Chat.notif.create(r.f, r.m);
		}

		var li = document.createElement('div');
		li.id = r.id;

		var prefix = document.createElement('span');
		prefix.className = 'prefix';
		prefix.innerText = r.f;
		li.appendChild(prefix);

		if(Chat.last_sent_nick === r.f){
			prefix.style.display = "none";
			li.prefix = prefix;
		} else {
			Chat.last_sent_nick = r.f;
		}

		var msg = document.createElement('div');
		msg.className = 'message';

		var body = document.createElement('span');
		body.className = 'body' + (fromSelf ? ' out' : ' in');
		Chat.append_msg(body, r.m);

		msg.appendChild(body);

		li.appendChild(msg);

		var c = document.createElement('li');
		c.appendChild(li);
		if (fromSelf){
			c.classList.add('message-from-self');
		}

		// Prepend because flex-direction: column-reverse
		Chat.msgs_list.prepend(c);

		// Scroll to new message
		Chat.scroll();
	},

	append_msg: function(el, msg){
		if(!msg) return;

		// If is object
		if(typeof msg.text !== 'undefined'){
			// Escape HTML
			el.innerText = msg.text;
			var text = el.innerHTML;

			// Parse urls
			text = text.replace(/(https?:\/\/[^\s]+)/g, function(url, a, b){
				var link = document.createElement('a');
				link.target = "_blank";

				// Un-escape
				link.innerHTML = url;
				url = link.innerText;
				link.href = url;

				// If link is image
				if(url.match(/.(png|jpe?g|gifv?)([?#].*)?$/g)){
					var img = document.createElement('img');
					img.style = 'max-width:100%;';
					img.src = url;

					link.innerText = "";
					link.appendChild(img);
				}

				return link.outerHTML;
			});

			if(typeof Emic !== 'undefined'){
				text = Emic.replace(text);
			}

			el.innerHTML = text;
		}

		if(typeof msg.type !== 'undefined'){
			// Image
			if(msg.type.match(/image.*/)){
				var img = document.createElement('img');
				img.style = 'max-width:100%;';
				img.src = msg.url;
				el.appendChild(img);
				return;
			}

			// Audio / Video
			if(m = msg.type.match(/(audio|video).*/)){
				var audio = document.createElement(m[1]);
				audio.controls = 'controls';

				var source = document.createElement("source");
				source.src = msg.url;
				source.type = msg.type;
				audio.appendChild(source);

				el.appendChild(audio);
				return;
			}

			// Default
			var link = document.createElement('a');
			link.href = msg.url;
			link.download = msg.name;
			link.innerText = msg.name;
			el.appendChild(link);
		}
	},

	force_login: function(fail){
		if(typeof fail !== "undefined"){
			Chat.login_error.innerText = fail;
		} else {
			Chat.login_error.innerText = '';
		}

		Chat.login_nick.value = sessionStorage.nick || localStorage.nick || "";
		Chat.login_modal.hidden = false;
		Chat.login_nick.focus();
	},

	login_event: function(){
		var nick = Chat.login_nick.value.trim();
		if(nick == ""){
			Chat.login_error.innerText = "请输入昵称。";
			return;
		}

		sessionStorage.nick = localStorage.nick = nick;
		Chat.socket.emit("login", {
			nick: nick
		});
	},

	reload: function(){
		if(typeof sessionStorage.nick !== "undefined" && sessionStorage.nick){
			Chat.socket.emit("login", {
				nick: sessionStorage.nick
			});
		}
	},

	user: {
		objects: {},

		// Load all users
		start: function(r){
			Chat.login_modal.hidden = true;
			Chat.current_room_id = r.room.id;
			Chat.active_room_name.innerText = r.room.name;
			Chat.clear_room_view();

			for(var user in r.users){
				var nick = document.createElement('li');
				nick.innerText = r.users[user];
				Chat.users.appendChild(nick);
				Chat.user.objects[r.users[user]] = nick;
			}

			Chat.render_rooms({
				rooms: r.rooms || Chat.rooms
			});
			Chat.cancel_room_event();
		},

		previous_messages: function(data){
			Chat.clear_room_view();
		},

		// User joined room
		enter: function(r){
			console.log("User " + r.nick + " joined.");

			if(Chat.user.objects.hasOwnProperty(r.nick)){
				return;
			}

			var nick = document.createElement('li');
			nick.innerText = r.nick;
			Chat.users.appendChild(nick);
			Chat.user.objects[r.nick] = nick;
		},

		// User left room
		leave: function(r){
			console.log("User " + r.nick + " left.");

			// Is not typing
			Chat.typing.remove(r.nick);

			// Remove user
			if(Chat.user.objects.hasOwnProperty(r.nick)){
				var element = Chat.user.objects[r.nick];
				element.parentNode.removeChild(element);
				delete Chat.user.objects[r.nick];
			}
		}
	},

	connect: function(){
		// Set green favicon
		Chat.notif.favicon('green');
		Chat.is_online = true;

		document.getElementById('offline').style.display = "none";
		Chat.clear_room_view();

		// force user to login
		Chat.force_login();
	},

	disconnect: function(){
		// Set green favicon
		Chat.notif.favicon('red');
		Chat.is_online = false;

		document.getElementById('offline').style.display = "block";
		Chat.clear_room_view();
	},

	init: function(socket){
		// Set green favicon
		Chat.notif.favicon('red');

		// Connect to socket.io
		Chat.socket = socket || io();

		// Create beep object
		Chat.notif.beep = Chat.notif.beep_create();

		// On focus
		window.addEventListener('focus', function(){
			Chat.is_focused = true;

			// If chat is not online, dont care.
			if(!Chat.is_online){
				return;
			}

			// Clear ttout, if there was
			typeof Chat.notif.ttout === "undefined" || clearInterval(Chat.notif.ttout);
			Chat.notif.ttout = undefined;

			// Clear notifications
			Chat.notif.clear();
			Chat.notif.msgs = 0;
			Chat.notif.favicon('green');

			// Set back page title
			document.title = Chat.original_title;
		});

		// On blur
		window.addEventListener('blur', function(){
			Chat.is_focused = false;
		});

		// On click send message
		Chat.send_btn.onclick = Chat.send_event;
		Chat.create_room_btn.onclick = Chat.create_room_event;
		Chat.room_submit.onclick = Chat.submit_room_event;
		Chat.room_cancel.onclick = Chat.cancel_room_event;
		Chat.room_name.onkeydown = function(e){
			var key = e.keyCode || window.event.keyCode;
			if(key === 13){
				Chat.submit_room_event();
				return false;
			}

			if(key === 27){
				Chat.cancel_room_event();
				return false;
			}

			return true;
		};
		Chat.login_submit.onclick = Chat.login_event;
		Chat.login_nick.onkeydown = function(e){
			var key = e.keyCode || window.event.keyCode;
			if(key === 13){
				Chat.login_event();
				return false;
			}

			return true;
		};

		// On enter send message
		Chat.textarea.onkeydown = function(e){
			var key = e.keyCode || window.event.keyCode;

			// If the user has pressed enter
			if(key === 13){
				Chat.send_event();
				return false;
			}

			return true;
		};

		// Check if is user typing
		Chat.textarea.onkeyup = Chat.typing.update;

		// On socket events
		Chat.socket.on("connect", Chat.connect);
		Chat.socket.on("disconnect", Chat.disconnect);

		Chat.socket.on("force-login", Chat.force_login);
		Chat.socket.on("typing", Chat.typing.event);
		Chat.socket.on("new-msg", Chat.new_msg);
		Chat.socket.on("room-list", Chat.render_rooms);
		Chat.socket.on("room-error", function(message){
			if(Chat.create_room_form.hidden){
				alert(message);
			} else {
				Chat.room_error.innerText = message;
			}
		});

		Chat.socket.on("previous-msg", Chat.user.previous_messages)
		Chat.socket.on("start", Chat.user.start);
		Chat.socket.on("ue", Chat.user.enter);
		Chat.socket.on("ul", Chat.user.leave);

		var dropZone = document.getElementsByTagName("body")[0];

		// Optional. Show the copy icon when dragging over. Seems to only work for chrome.
		dropZone.addEventListener('dragover', function(e){
			e.stopPropagation();
			e.preventDefault();

			e.dataTransfer.dropEffect = 'copy';
		});

		// Get file data on drop
		dropZone.addEventListener('drop', function(e){
			e.stopPropagation();
			e.preventDefault();

			var files = e.dataTransfer.files; // Array of all files
			for(var i = 0;i < files.length;i++){
				var file = files[i];

				// Max 10 MB
				if(file.size > 10485760){
					alert("文件大小不能超过 10MB。");
					return;
				}

				var reader = new FileReader();
				reader.onload = (function(file){
					return function(e){
						Chat.send_msg({
							type: file.type,
							name: file.name,
							url: e.target.result
						});
					};
				})(file);
				reader.readAsDataURL(file);
			}
		});

		// close socket upon refresh or tab close, free the username
		window.addEventListener("beforeunload", () => {
			if(!Chat.is_online){
				return;
			}
			Chat.socket.disconnect();
		});
	}
};
