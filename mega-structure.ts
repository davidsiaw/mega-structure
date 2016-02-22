// Copyright (c) 2016, Sebastien Sydney Robert Bigot
// All rights reserved.
//
// Redistribution and use in source and binary forms, with or without
// modification, are permitted provided that the following conditions are met:
//
// 1. Redistributions of source code must retain the above copyright notice, this
//    list of conditions and the following disclaimer.
// 2. Redistributions in binary form must reproduce the above copyright notice,
//    this list of conditions and the following disclaimer in the documentation
//    and/or other materials provided with the distribution.
//
// THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS" AND
// ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE IMPLIED
// WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE
// DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT OWNER OR CONTRIBUTORS BE LIABLE FOR
// ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES
// (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES;
// LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND
// ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT
// (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE OF THIS
// SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
//
// The views and conclusions contained in the software and documentation are those
// of the authors and should not be interpreted as representing official policies,
// either expressed or implied, of the FreeBSD Project.

///<reference path="typings/browserify/browserify.d.ts"/>
///<reference path="typings/gl-matrix/gl-matrix.d.ts"/>
var glmat = require('./bower_components/gl-matrix/dist/gl-matrix-min.js');

import StructureArtist = require('./structure-artist');

// debugger;

window.onload = () => {

	var canvas = <HTMLCanvasElement>document.createElement("canvas");
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    document.body.appendChild(canvas);

    var gl = <WebGLRenderingContext>canvas.getContext("webgl", {});
    gl.clearColor(0, 0, 0, 1);
    gl.enable(gl.DEPTH_TEST);
    
    var scriptreq = new XMLHttpRequest();
    scriptreq.open('GET', './examples/city.es');
    scriptreq.onload = function() {

		var artist: StructureArtist = null;

		var myWorker = new Worker("synthesizer-webworker.js");
		myWorker.onmessage = function(e) {
			artist = new StructureArtist(gl, e.data);
			// myWorker.terminate();
		}
		myWorker.postMessage(scriptreq.responseText);

		var lastTime = new Date().getTime();
		
		var theta = 0;

		function animate() {

			var timeNow = new Date().getTime();

			var width = window.innerWidth;
			var height = window.innerHeight;

			gl.viewport(0, 0, width, height);
			gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
			
			if (artist) {

				var prMatrix = <Float32Array>glmat.mat4.create();
				glmat.mat4.perspective(prMatrix, 45, width / height, 0.1, 100.0);

				var mvMatrix = <Float32Array>glmat.mat4.create();  
                glmat.mat4.translate(mvMatrix, mvMatrix, [0.0, 0.0, -2]);

				// "Turntable"
                var dt = (timeNow - lastTime) / (60 * 1000);
                theta += 2 * Math.PI * 5 * dt
				glmat.mat4.rotate(mvMatrix, mvMatrix, theta, [1, 1, 1]);

				artist.draw(prMatrix, mvMatrix);
			}

			gl.flush();

			lastTime = timeNow;

			requestAnimationFrame(animate);
		}

		animate();

	}

	scriptreq.send();
}
