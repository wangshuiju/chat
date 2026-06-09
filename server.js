require('dotenv').config()
const express = require('express')
const app = express()

const path = require('path')
const html = path.join(__dirname, '/html');
app.use(express.static(html))

const port = process.argv[2] || 8090;
const http = require("http").Server(app);

const maxHttpBufferSizeInMb = parseInt(process.env.MAX_HTTP_BUFFER_SIZE_MB || '1');
const io = require("socket.io")(http, {
  maxHttpBufferSize: maxHttpBufferSizeInMb * 1024 * 1024,
});
const DEFAULT_ROOM_NAME = 'IM 聊天组';
const rooms = new Map();
const users = [];
let roomSeq = 1;
let msg_id = 1;

http.listen(port, function(){
	console.log("Starting server on port %s", port);
});

function createRoom(name){
	const room = {
		id: 'room_' + roomSeq++,
		name: name,
		users: []
	};
	rooms.set(room.id, room);
	return room;
}

function ensureDefaultRoom(){
	if(rooms.size === 0){
		return createRoom(DEFAULT_ROOM_NAME);
	}

	return rooms.values().next().value;
}

function roomList(){
	return Array.from(rooms.values()).map(function(room){
		return {
			id: room.id,
			name: room.name,
			count: room.users.length
		};
	});
}

function emitRooms(){
	io.emit("room-list", {
		rooms: roomList()
	});
}

function sanitizeNick(nick){
	return nick.replace(/(<([^>]+)>)/ig, "");
}

function leaveRoom(socket, state){
	if(!state.roomId || !rooms.has(state.roomId)){
		state.roomId = null;
		return;
	}

	const room = rooms.get(state.roomId);
	socket.leave(room.id);
	room.users = room.users.filter(function(user){
		return user !== state.nick;
	});

	io.to(room.id).emit("ul", {
		"nick": state.nick
	});

	console.log("User %s left room %s.", sanitizeNick(state.nick), room.name);

	if(room.users.length === 0){
		rooms.delete(room.id);
		console.log("Room %s removed.", room.name);
	}

	state.roomId = null;
	emitRooms();
}

function joinRoom(socket, state, room){
	if(state.roomId === room.id){
		socket.emit("start", {
			"users": room.users,
			"room": {
				id: room.id,
				name: room.name
			},
			"rooms": roomList()
		});
		return;
	}

	if(state.roomId){
		leaveRoom(socket, state);
	}

	state.roomId = room.id;
	room.users.push(state.nick);
	socket.join(room.id);

	socket.emit("start", {
		"users": room.users,
		"room": {
			id: room.id,
			name: room.name
		},
		"rooms": roomList()
	});

	socket.broadcast.to(room.id).emit("ue", {
		"nick": state.nick
	});

	console.log("User %s joined room %s.", sanitizeNick(state.nick), room.name);
	emitRooms();
}

io.sockets.on("connection", function(socket){
	console.log("New connection!");

	const state = {
		nick: null,
		roomId: null
	};

	socket.emit("room-list", {
		rooms: roomList()
	});

	socket.on("login", function(data){
		data = data || {};
		data.nick = data.nick || "";

		// Security checks
		data.nick = data.nick.trim();

		// If is empty
		if(data.nick == ""){
			socket.emit("force-login", "昵称不能为空。");
			state.nick = null;
			return;
		}

		// If is already in
		if(users.indexOf(data.nick) != -1){
			socket.emit("force-login", "这个昵称已经有人使用。");
			state.nick = null;
			return;
		}

		// Save nick
		state.nick = data.nick;
		users.push(data.nick);

		console.log("User %s logged in.", sanitizeNick(state.nick));
		joinRoom(socket, state, ensureDefaultRoom());
	});

	socket.on("create-room", function(data){
		data = data || {};

		if(state.nick == null){
			socket.emit("force-login", "请先登录后再创建聊天组。");
			return;
		}

		const name = (data.name || "").trim();
		if(name == ""){
			socket.emit("room-error", "聊天组名称不能为空。");
			return;
		}

		if(name.length > 40){
			socket.emit("room-error", "聊天组名称不能超过 40 个字。");
			return;
		}

		const exists = Array.from(rooms.values()).some(function(room){
			return room.name.toLowerCase() === name.toLowerCase();
		});
		if(exists){
			socket.emit("room-error", "同名聊天组已存在。");
			return;
		}

		joinRoom(socket, state, createRoom(name));
	});

	socket.on("join-room", function(data){
		data = data || {};

		if(state.nick == null){
			socket.emit("force-login", "请先登录后再切换聊天组。");
			return;
		}

		if(!rooms.has(data.roomId)){
			socket.emit("room-error", "该聊天组已不存在。");
			emitRooms();
			return;
		}

		joinRoom(socket, state, rooms.get(data.roomId));
	});

	socket.on("send-msg", function(data){
		// If is logged in
		if(state.nick == null){
			socket.emit("force-login", "请先登录后再发送消息。");
			return;
		}

		if(!state.roomId || !rooms.has(state.roomId)){
			socket.emit("room-error", "请先进入一个聊天组。");
			return;
		}

		const msg = {
			"f": state.nick,
			"m": data.m,
			"id": "msg_" + (msg_id++)
		}

		// Send everyone message
		io.to(state.roomId).emit("new-msg", msg);

		console.log("User %s sent message.", sanitizeNick(state.nick));
	});

	socket.on("typing", function(typing){
		// Only logged in users
		if(state.nick != null && state.roomId && rooms.has(state.roomId)){
			socket.broadcast.to(state.roomId).emit("typing", {
				status: typing,
				nick: state.nick
			});

			console.log("%s %s typing.", sanitizeNick(state.nick), typing ? "is" : "is not");
		}
	});

	socket.on("disconnect", function(){
		console.log("Got disconnect!");

		if(state.nick != null){
			// Remove user from users
			const index = users.indexOf(state.nick);
			if(index !== -1){
				users.splice(index, 1);
			}
			leaveRoom(socket, state);
			console.log("User %s logged out.", sanitizeNick(state.nick));
			state.nick = null;
		}
	});
});
