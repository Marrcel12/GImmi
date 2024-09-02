const audioSourceSelect = document.getElementById('audioSourceSelect');
const micSelect = document.getElementById('micSelect');
const micSection = document.getElementById('micSection');
const startButton = document.getElementById('start');
const stopButton = document.getElementById('stop');
let mediaRecorder;
let socket;
let audioContext;
let analyser;
let dataArray;
let silenceTimeout;
let isRecording = false;
let recordedChunks = [];
let silenceDetectionStarted = false;

// Function to get available microphones
async function getMicrophones() {
    const devices = await navigator.mediaDevices.enumerateDevices();
    const audioInputs = devices.filter(device => device.kind === 'audioinput');
    micSelect.innerHTML = audioInputs.map(device => `<option value="${device.deviceId}">${device.label || 'Microphone ' + (audioInputs.indexOf(device) + 1)}</option>`).join('');
}

// Function to handle audio source selection change
function handleAudioSourceChange() {
    const audioSource = audioSourceSelect.value;
    if (audioSource === 'system') {
        micSection.style.display = 'none';
    } else {
        micSection.style.display = 'block';
    }
}

// Function to start recording based on the selected audio source
async function startRecording() {
    try {
        let stream;
        const selectedMic = micSelect.value;
        const audioSource = audioSourceSelect.value;

        if (audioSource === 'mic') {
            // Capture audio from the microphone
            stream = await navigator.mediaDevices.getUserMedia({ audio: { deviceId: selectedMic } });
            socket = io('/mic', { transports: ['websocket'] });
        } else if (audioSource === 'system') {
            // Capture system audio
            stream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true });
            stream.getVideoTracks().forEach(track => track.stop()); // Stop capturing video
            socket = io('/system', { transports: ['websocket'] });
        } else if (audioSource === 'both') {
            // Capture both microphone and system audio
            const micStream = await navigator.mediaDevices.getUserMedia({ audio: { deviceId: selectedMic } });
            const systemStream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true });
            systemStream.getVideoTracks().forEach(track => track.stop());

            audioContext = new AudioContext();
            const destination = audioContext.createMediaStreamDestination();

            const micSource = audioContext.createMediaStreamSource(micStream);
            const systemSource = audioContext.createMediaStreamSource(systemStream);

            micSource.connect(destination);
            systemSource.connect(destination);

            stream = destination.stream;
            socket = io('/both', { transports: ['websocket'] });
        }

        // Setup audio analysis for silence detection
        audioContext = audioContext || new AudioContext();
        analyser = audioContext.createAnalyser();
        const source = audioContext.createMediaStreamSource(stream);
        source.connect(analyser);
        analyser.fftSize = 2048;
        dataArray = new Uint8Array(analyser.fftSize);

        mediaRecorder = new MediaRecorder(stream);

        mediaRecorder.ondataavailable = (event) => {
            if (event.data.size > 0) {
                recordedChunks.push(event.data);
            }
        };

        mediaRecorder.onstop = () => {
            console.log('MediaRecorder stopped');
            const audioBlob = new Blob(recordedChunks, { type: 'audio/webm' });
            recordedChunks = [];
            let reader = new FileReader();
            reader.readAsDataURL(audioBlob);
            reader.onloadend = function() {
                let base64data = reader.result.split(',')[1];
                if (socket.connected) {
                    socket.emit('audio', base64data);
                }
            };
        };

        socket.on('connect', () => {
            console.log('Socket.IO connection opened');
        });

        socket.on('connect_error', (error) => {
            console.error('Socket.IO connect error:', error);
        });

        socket.on('disconnect', (reason) => {
            console.log('Socket.IO connection closed:', reason);
        });

        stopButton.onclick = () => {
            if (mediaRecorder && mediaRecorder.state !== "inactive") {
                mediaRecorder.stop();
            }
            socket.disconnect();
            stopButton.disabled = true;
            startButton.disabled = false;
        };

        startMediaRecorder();

    } catch (error) {
        console.error('Error accessing media devices:', error);
    }
}

// Function to start the MediaRecorder
function startMediaRecorder() {
    if (mediaRecorder && mediaRecorder.state === "inactive" && !isRecording) {
        mediaRecorder.start();
        isRecording = true;
        startButton.disabled = true;
        stopButton.disabled = false;
        console.log('MediaRecorder started');

        // Delay the start of silence detection to allow initial audio setup
        setTimeout(() => {
            silenceDetectionStarted = true;
            detectSilence(); // Start detecting silence after delay
        }, 500); // 0.5 second delay
    }
}

// Function to stop the MediaRecorder
function stopMediaRecorder() {
    if (mediaRecorder && mediaRecorder.state === "recording" && isRecording) {
        mediaRecorder.stop();
        isRecording = false;
        silenceDetectionStarted = false; // Reset silence detection flag
        console.log('MediaRecorder stopped');
    }
}

// Function to detect silence in the audio stream
function detectSilence() {
    if (!silenceDetectionStarted) return; // Only detect silence if detection is started

    analyser.getByteTimeDomainData(dataArray);
    const maxAmplitude = Math.max(...dataArray) / 128 - 1;
    if (maxAmplitude < 0.02) {  // Adjusted silence threshold to be more robust
        if (!silenceTimeout) {
            silenceTimeout = setTimeout(() => {
                stopMediaRecorder();
            }, 1500);  // Increased silence delay to avoid premature stopping
        }
    } else {
        clearTimeout(silenceTimeout);
        silenceTimeout = null;
        startMediaRecorder();
    }
    requestAnimationFrame(detectSilence);
}

audioSourceSelect.onchange = handleAudioSourceChange;
startButton.onclick = startRecording;

// Populate the microphone dropdown on page load
getMicrophones();
