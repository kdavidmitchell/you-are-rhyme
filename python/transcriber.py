import logging
import numpy as np
from flask import Flask, request, jsonify
from faster_whisper import WhisperModel

logging.basicConfig(level=logging.INFO)

app = Flask(__name__)

model_size = "base.en"
logging.info(f"Loading faster-whisper {model_size} model...")
model = WhisperModel(model_size, device="cpu", compute_type="int8")
logging.info("Model loaded.")

@app.route('/transcribe', methods=['POST'])
def transcribe():
    audio_bytes = request.data
    if not audio_bytes:
        return jsonify({"text": ""})
        
    audio_array = np.frombuffer(audio_bytes, dtype=np.int16).astype(np.float32) / 32768.0
    audio_duration = len(audio_array) / 16000.0
    
    segments_gen, info = model.transcribe(audio_array, beam_size=5, vad_filter=True, word_timestamps=True)
    segments = list(segments_gen)
    
    text = " ".join([segment.text for segment in segments]).strip()
    
    # Calculate dramatic pause duration between words
    pause_duration = 0.0
    all_words = []
    
    for segment in segments:
        if hasattr(segment, 'words') and segment.words:
            all_words.extend(segment.words)
            
    if len(all_words) > 0:
        # Silence before the first word
        if all_words[0].start > 0.4:
            pause_duration += all_words[0].start
            
        # Silence after the last word
        end_silence = audio_duration - all_words[-1].end
        if end_silence > 0.4:
            pause_duration += end_silence
            
        # Gaps between words
        for i in range(1, len(all_words)):
            gap = all_words[i].start - all_words[i-1].end
            # Only count gaps larger than 0.4s as a "dramatic pause"
            if gap > 0.4:
                pause_duration += gap
    else:
        # No words spoken, the entire turn was a pause
        pause_duration = audio_duration
        
    word_logs = [f"{w.word}({w.start:.2f}-{w.end:.2f})" for w in all_words]
    logging.info(f"Word timestamps: {', '.join(word_logs)}")
    
    logging.info(f"Transcribed turn: {text} (Pauses: {pause_duration}s)")
    return jsonify({"text": text, "pauseDuration": pause_duration})

if __name__ == "__main__":
    app.run(port=5000, debug=False)
