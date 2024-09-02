from flask import Flask, render_template
from flask_socketio import SocketIO, emit

app = Flask(__name__)
socketio = SocketIO(app)

@app.route('/')
def index():
    return render_template('index.html')

@socketio.on('audio', namespace='/mic')
def handle_mic_audio(data):
    # Process microphone audio data
    print('Received microphone audio data')

@socketio.on('audio', namespace='/system')
def handle_system_audio(data):
    # Process system audio data
    print('Received system audio data')

@socketio.on('audio', namespace='/both')
def handle_both_audio(data):
    # Process both microphone and system audio data
    print('Received combined audio data')

if __name__ == '__main__':
    socketio.run(app, debug=True)
