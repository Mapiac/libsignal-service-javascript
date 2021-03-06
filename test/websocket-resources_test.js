"use strict";
const assert = require("chai").assert;
const MockServer = require("mock-socket").Server;
const protobuf = require("../src/protobufs.js");
const WebSocketMessage = protobuf.lookupType("signalservice.WebSocketMessage");
const assertEqualArrayBuffers = require("./_test.js").assertEqualArrayBuffers;
const WebSocketResource = require("../src/websocket-resources.js");

describe("WebSocket-Resource", () => {
  describe("requests and responses", () => {
    it("receives requests and sends responses", done => {
      // mock socket
      const request_id = "1";
      const socket = {
        send(data) {
          const message = WebSocketMessage.decode(data);
          assert.strictEqual(message.type, WebSocketMessage.Type.RESPONSE);
          assert.strictEqual(message.response.message, "OK");
          assert.strictEqual(message.response.status, 200);
          assert.strictEqual(message.response.id.toString(), request_id);
          done();
        },
        addEventListener() {}
      };

      // actual test
      const resource = new WebSocketResource(socket, {
        handleRequest(request) {
          assert.strictEqual(request.verb, "PUT");
          assert.strictEqual(request.path, "/some/path");
          assertEqualArrayBuffers(
            request.body,
            new Uint8Array([1, 2, 3]).buffer
          );
          request.respond(200, "OK");
        }
      });

      // mock socket request
      const message = WebSocketMessage.create({
        type: WebSocketMessage.Type.REQUEST,
        request: {
          id: request_id,
          verb: "PUT",
          path: "/some/path",
          body: new Uint8Array([1, 2, 3])
        }
      });
      socket.onmessage({
        data: new Uint8Array(WebSocketMessage.encode(message).finish()).buffer
      });
    });

    it("sends requests and receives responses", done => {
      // mock socket and request handler
      let request_id;
      const socket = {
        send(data) {
          const message = WebSocketMessage.decode(data);
          assert.strictEqual(message.type, WebSocketMessage.Type.REQUEST);
          assert.strictEqual(message.request.verb, "PUT");
          assert.strictEqual(message.request.path, "/some/path");
          assertEqualArrayBuffers(
            message.request.body,
            new Uint8Array([1, 2, 3]).buffer
          );
          request_id = message.request.id;
        },
        addEventListener() {}
      };

      // actual test
      const resource = new WebSocketResource(socket);
      resource.sendRequest({
        verb: "PUT",
        path: "/some/path",
        body: new Uint8Array([1, 2, 3]).buffer,
        error: done,
        success(message, status, request) {
          assert.strictEqual(message, "OK");
          assert.strictEqual(status, 200);
          done();
        }
      });

      // mock socket response
      const message = WebSocketMessage.create({
        type: WebSocketMessage.Type.RESPONSE,
        response: { id: request_id, message: "OK", status: 200 }
      });
      socket.onmessage({
        data: new Uint8Array(WebSocketMessage.encode(message).finish()).buffer
      });
    });
  });

  describe.skip("close", () => {
    it("closes the connection", done => {
      const mockServer = new MockServer("ws://localhost:8081");
      mockServer.on("connection", server => {
        server.on("close", done);
      });
      const resource = new WebSocketResource(
        new WebSocket("ws://localhost:8081")
      );
      resource.close();
    });
  });

  describe.skip("with a keepalive config", function() {
    this.timeout(60000);
    it("sends keepalives once a minute", done => {
      const mockServer = new MockServer("ws://localhost:8081");
      mockServer.on("connection", server => {
        server.on("message", data => {
          const message = WebSocketMessage.decode(data);
          assert.strictEqual(message.type, WebSocketMessage.Type.REQUEST);
          assert.strictEqual(message.request.verb, "GET");
          assert.strictEqual(message.request.path, "/v1/keepalive");
          server.close();
          done();
        });
      });
      new WebSocketResource(new WebSocket("ws://localhost:8081"), {
        keepalive: { path: "/v1/keepalive" }
      });
    });

    it("uses / as a default path", done => {
      const mockServer = new MockServer("ws://localhost:8081");
      mockServer.on("connection", server => {
        server.on("message", data => {
          const message = WebSocketMessage.decode(data);
          assert.strictEqual(message.type, WebSocketMessage.Type.REQUEST);
          assert.strictEqual(message.request.verb, "GET");
          assert.strictEqual(message.request.path, "/");
          server.close();
          done();
        });
      });
      new WebSocketResource(new WebSocket("ws://localhost:8081"), {
        keepalive: true
      });
    });

    it("optionally disconnects if no response", function(done) {
      this.timeout(65000);
      const mockServer = new MockServer("ws://localhost:8081");
      const socket = new WebSocket("ws://localhost:8081");
      mockServer.on("connection", server => {
        server.on("close", done);
      });
      new WebSocketResource(socket, { keepalive: true });
    });

    it("allows resetting the keepalive timer", function(done) {
      this.timeout(65000);
      const mockServer = new MockServer("ws://localhost:8081");
      const socket = new WebSocket("ws://localhost:8081");
      const startTime = Date.now();
      mockServer.on("connection", server => {
        server.on("message", data => {
          const message = WebSocketMessage.decode(data);
          assert.strictEqual(message.type, WebSocketMessage.Type.REQUEST);
          assert.strictEqual(message.request.verb, "GET");
          assert.strictEqual(message.request.path, "/");
          assert(
            Date.now() > startTime + 60000,
            "keepalive time should be longer than a minute"
          );
          server.close();
          done();
        });
      });
      const resource = new WebSocketResource(socket, { keepalive: true });
      setTimeout(() => {
        resource.resetKeepAliveTimer();
      }, 5000);
    });
  });
});
