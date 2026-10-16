import { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Capacitor, registerPlugin } from '@capacitor/core';
import { Directory, Filesystem } from '@capacitor/filesystem';
import { 
    X, Search, Gem, ChevronDown, Maximize, Play, Pause, Undo, Redo, 
    VolumeX, Volume2, Scissors, Image as ImageIcon, Music, Type, Layers, 
    Subtitles, Plus, MonitorPlay, Loader2, Video, PlusSquare, Sliders
} from 'lucide-react';
import { FFmpeg } from '@ffmpeg/ffmpeg';
import { fetchFile, toBlobURL } from '@ffmpeg/util';
import { apiUrl, authHeaders } from '../api';

const Gallery = registerPlugin('Gallery');

const uint8ArrayToBase64 = (bytes) => {
    let binary = '';
    const chunkSize = 0x8000;
    for (let offset = 0; offset < bytes.length; offset += chunkSize) {
        binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize));
    }
    return btoa(binary);
};

const saveVideoToDevice = async (data, fileName) => {
    if (!Capacitor.isNativePlatform()) {
        const blobUrl = URL.createObjectURL(new Blob([data], { type: 'video/mp4' }));
        const link = document.createElement('a');
        link.href = blobUrl;
        link.download = fileName;
        document.body.appendChild(link);
        link.click();
        link.remove();
        setTimeout(() => URL.revokeObjectURL(blobUrl), 1000);
        return 'download';
    }

    const base64Data = uint8ArrayToBase64(data);
    try {
        await Gallery.saveVideo({ fileName, data: base64Data });
        return 'gallery';
    } catch (galleryError) {
        console.warn('MediaStore không khả dụng, chuyển sang lưu ExternalStorage:', galleryError);
        await Filesystem.writeFile({
            path: `Movies/CameraApp/${fileName}`,
            data: base64Data,
            directory: Directory.ExternalStorage,
            recursive: true,
        });
        return 'gallery';
    }
};

export default function VideoEdit() {
    const navigate = useNavigate();
    const [loaded, setLoaded] = useState(false);
    const [isProcessing, setIsProcessing] = useState(false);
    const [exportProgress, setExportProgress] = useState(0);
    const [statusText, setStatusText] = useState('Đang tải mô hình...');
    
    // HỆ THỐNG ĐA CLIP VIDEO
    const [clips, setClips] = useState([]);
    const [activeClipIndex, setActiveClipIndex] = useState(0);
    const [isPlaying, setIsPlaying] = useState(false);
    const [currentTime, setCurrentTime] = useState(0);
    const [isMuted, setIsMuted] = useState(false); 
    
    // HỆ THỐNG ĐA LAYER ÂM THANH
    const [audioClips, setAudioClips] = useState([]);
    const [selectedElement, setSelectedElement] = useState(null); 
    const [textLayers, setTextLayers] = useState([]);
    const [selectedTextId, setSelectedTextId] = useState(null);
    const [overlayLayers, setOverlayLayers] = useState([]);
    const [selectedOverlayId, setSelectedOverlayId] = useState(null);
    const [isAdjustmentsOpen, setIsAdjustmentsOpen] = useState(false);
    
    const totalVideoDuration = clips.reduce((acc, clip) => acc + clip.duration, 0);
    const maxAudioDuration = audioClips.reduce((max, clip) => Math.max(max, clip.startTime + (clip.trimEnd - clip.trimStart)), 0);
    const maxOverlayDuration = overlayLayers.reduce((max, layer) => Math.max(max, layer.startTime + (layer.trimEnd - layer.trimStart)), 0);
    const maxTextDuration = textLayers.reduce((max, layer) => Math.max(max, layer.startTime + (layer.trimEnd - layer.trimStart)), 0);
    const maxTimelineDuration = Math.max(totalVideoDuration, maxAudioDuration, maxOverlayDuration, maxTextDuration); 
    
    const currentVideoSrc = clips[activeClipIndex]?.url || null;
    const currentAdjustments = clips[activeClipIndex]?.adjustments || {
        brightness: 0,
        contrast: 1,
        saturation: 1,
        grayscale: 0,
        blur: 0,
    };
    
    const videoRef = useRef(null);
    const audioRef = useRef(null); 
    const timelineRef = useRef(null); 
    const ffmpegRef = useRef(new FFmpeg());
    const exportCancelledRef = useRef(false);
    const fileInputRef = useRef(null);
    const audioInputRef = useRef(null); 
    const overlayInputRef = useRef(null);
    const switchingClipRef = useRef(false);
    const continuePlaybackRef = useRef(false);
    const clipTransitionRef = useRef(false);

    const pxPerSec = 50; 
    const PLAYHEAD_OFFSET = 140; 
    const MAX_LAYER_DURATION = 3600;

    // QUẢN LÝ CÁC THAO TÁC VUỐT, KÉO, CẮT
    const isInteracting = useRef(false);
    const startX = useRef(0);
    const scrollLeft = useRef(0);
    const seekTimeRef = useRef(null); 
    
    // Đã nâng cấp để nhận diện loại đang kéo là Video hay Audio
    const resizeData = useRef({ isResizing: false, type: null, clipId: null, startX: 0, startTrimEnd: 0 }); 
    const dragAudioData = useRef({ isPending: false, isActive: false, clipId: null, startX: 0, initialStartTime: 0 }); 
    const dragVideoData = useRef({ isPending: false, isActive: false, clipId: null, startX: 0 }); 
    const dragOverlayData = useRef({ isPending: false, isActive: false, clipId: null, startX: 0, initialStartTime: 0 });
    const dragTextData = useRef({ isPending: false, isActive: false, clipId: null, startX: 0, initialStartTime: 0 });
    const textGesture = useRef(null);
    const overlayGesture = useRef(null);

    const handleOverlaySelect = (event) => {
        const file = event.target.files?.[0];
        if (!file || !file.type.startsWith('image/') && !file.type.startsWith('video/')) return;
        const layer = {
            id: `overlay-${Date.now()}`,
            url: URL.createObjectURL(file),
            file,
            type: file.type.startsWith('video/') ? 'video' : 'image',
            originalDuration: file.type.startsWith('video/') ? 0 : 3,
            trimStart: 0,
            trimEnd: file.type.startsWith('video/') ? 0 : 3,
            startTime: currentTime,
            x: 50,
            y: 50,
            scale: 1,
            rotation: 0,
            opacity: 1,
        };
        if (layer.type === 'video') {
            const media = document.createElement('video');
            media.preload = 'metadata';
            media.src = layer.url;
            media.onloadedmetadata = () => {
                const duration = Number.isFinite(media.duration) ? media.duration : 3;
                const readyLayer = { ...layer, originalDuration: duration, trimEnd: duration };
                setOverlayLayers((current) => [...current, readyLayer]);
                setSelectedOverlayId(readyLayer.id);
                setSelectedElement({ type: 'overlay', id: readyLayer.id });
            };
            media.onerror = () => URL.revokeObjectURL(layer.url);
        } else {
            setOverlayLayers((current) => [...current, layer]);
            setSelectedOverlayId(layer.id);
            setSelectedElement({ type: 'overlay', id: layer.id });
        }
        event.target.value = null;
    };

    const handleOverlayPointerDown = (event, layer, mode = 'move') => {
        event.stopPropagation();
        event.preventDefault();
        setSelectedOverlayId(layer.id);
        setSelectedElement({ type: 'overlay', id: layer.id });
        const rect = event.currentTarget.closest('[data-video-preview]')?.getBoundingClientRect();
        if (!rect) return;
        const centerX = rect.left + (layer.x / 100) * rect.width;
        const centerY = rect.top + (layer.y / 100) * rect.height;
        overlayGesture.current = {
            mode, id: layer.id, rect, pointerId: event.pointerId, startX: event.clientX, startY: event.clientY,
            centerX, centerY, startLayer: { ...layer },
            startDistance: Math.hypot(event.clientX - centerX, event.clientY - centerY) || 1,
            startAngle: Math.atan2(event.clientY - centerY, event.clientX - centerX),
        };
        event.currentTarget.setPointerCapture?.(event.pointerId);
    };

    const handleOverlayPointerMove = (event) => {
        const gesture = overlayGesture.current;
        if (!gesture) return;
        event.preventDefault();
        const { rect, startLayer } = gesture;
        if (gesture.mode === 'move') {
            updateOverlayLayer(gesture.id, {
                x: Math.max(0, Math.min(100, startLayer.x + ((event.clientX - gesture.startX) / rect.width) * 100)),
                y: Math.max(0, Math.min(100, startLayer.y + ((event.clientY - gesture.startY) / rect.height) * 100)),
            });
        } else if (gesture.mode === 'scale') {
            const distance = Math.hypot(event.clientX - gesture.centerX, event.clientY - gesture.centerY);
            updateOverlayLayer(gesture.id, { scale: Math.max(0.2, Math.min(4, startLayer.scale * distance / gesture.startDistance)) });
        } else {
            const angle = Math.atan2(event.clientY - gesture.centerY, event.clientX - gesture.centerX);
            updateOverlayLayer(gesture.id, { rotation: startLayer.rotation + (angle - gesture.startAngle) * 180 / Math.PI });
        }
    };

    const handleOverlayPointerUp = (event) => {
        if (overlayGesture.current?.pointerId && event?.currentTarget?.hasPointerCapture?.(overlayGesture.current.pointerId)) {
            event.currentTarget.releasePointerCapture(overlayGesture.current.pointerId);
        }
        overlayGesture.current = null;
    };

    const updateOverlayLayer = (id, changes) => {
        setOverlayLayers((current) => current.map((layer) => (
            layer.id === id ? { ...layer, ...changes } : layer
        )));
    };

    const deleteOverlay = (event, id) => {
        event.stopPropagation();
        const layer = overlayLayers.find((item) => item.id === id);
        if (layer) URL.revokeObjectURL(layer.url);
        setOverlayLayers((current) => current.filter((layer) => layer.id !== id));
        setSelectedOverlayId(null);
        setSelectedElement(null);
    };

    useEffect(() => () => {
        overlayLayers.forEach((layer) => URL.revokeObjectURL(layer.url));
    }, []);

    const addTextLayer = () => {
        const value = window.prompt('Nhập văn bản:', 'Văn bản mới');
        if (!value?.trim()) return;

        setIsAdjustmentsOpen(false);
        const layer = {
            id: `text-${Date.now()}`,
            text: value.trim(),
            originalDuration: 3,
            trimStart: 0,
            trimEnd: 3,
            startTime: currentTime,
            x: 50,
            y: 50,
            scale: 1,
            rotation: 0,
        };
        setTextLayers((current) => [...current, layer]);
        setSelectedTextId(layer.id);
        setSelectedElement({ type: 'text', id: layer.id });
    };

    const updateTextLayer = (id, changes) => {
        setTextLayers((current) => current.map((layer) => (
            layer.id === id ? { ...layer, ...changes } : layer
        )));
    };

    const handleTextPointerDown = (event, layer, mode = 'move') => {
        event.stopPropagation();
        event.preventDefault();
        setSelectedTextId(layer.id);
        setSelectedElement({ type: 'text', id: layer.id });

        const rect = event.currentTarget.closest('[data-video-preview]')?.getBoundingClientRect();
        if (!rect) return;

        const centerX = rect.left + (layer.x / 100) * rect.width;
        const centerY = rect.top + (layer.y / 100) * rect.height;
        textGesture.current = {
            mode,
            id: layer.id,
            rect,
            pointerId: event.pointerId,
            startX: event.clientX,
            startY: event.clientY,
            centerX,
            centerY,
            startLayer: { ...layer },
            startDistance: Math.hypot(event.clientX - centerX, event.clientY - centerY) || 1,
            startAngle: Math.atan2(event.clientY - centerY, event.clientX - centerX),
        };
        event.currentTarget.setPointerCapture?.(event.pointerId);
    };

    const handleTextPointerMove = (event) => {
        const gesture = textGesture.current;
        if (!gesture) return;
        event.preventDefault();

        const { rect, startLayer } = gesture;
        if (gesture.mode === 'move') {
            updateTextLayer(gesture.id, {
                x: Math.max(0, Math.min(100, startLayer.x + ((event.clientX - gesture.startX) / rect.width) * 100)),
                y: Math.max(0, Math.min(100, startLayer.y + ((event.clientY - gesture.startY) / rect.height) * 100)),
            });
        } else if (gesture.mode === 'scale') {
            const distance = Math.hypot(event.clientX - gesture.centerX, event.clientY - gesture.centerY);
            updateTextLayer(gesture.id, {
                scale: Math.max(0.35, Math.min(4, startLayer.scale * (distance / gesture.startDistance))),
            });
        } else if (gesture.mode === 'rotate') {
            const angle = Math.atan2(event.clientY - gesture.centerY, event.clientX - gesture.centerX);
            const degrees = (angle - gesture.startAngle) * (180 / Math.PI);
            updateTextLayer(gesture.id, { rotation: startLayer.rotation + degrees });
        }
    };

    const handleTextPointerUp = (event) => {
        if (textGesture.current?.pointerId && event?.currentTarget?.hasPointerCapture?.(textGesture.current.pointerId)) {
            event.currentTarget.releasePointerCapture(textGesture.current.pointerId);
        }
        textGesture.current = null;
    };

    const deleteSelectedText = (event, id) => {
        event.stopPropagation();
        setTextLayers((current) => current.filter((layer) => layer.id !== id));
        setSelectedTextId(null);
        setSelectedElement(null);
    };

    useEffect(() => {
        const loadFFmpeg = async () => {
            const baseURL = 'https://unpkg.com/@ffmpeg/core@0.12.6/dist/esm';
            try {
                await ffmpegRef.current.load({
                    coreURL: await toBlobURL(`${baseURL}/ffmpeg-core.js`, 'text/javascript'),
                    wasmURL: await toBlobURL(`${baseURL}/ffmpeg-core.wasm`, 'application/wasm'),
                });
                setLoaded(true);
            } catch (error) { setStatusText('Lỗi tải thư viện'); }
        };
        loadFFmpeg();
    }, []);

    // ĐỒNG BỘ PHÁT NHẠC
    useEffect(() => {
        if (!audioRef.current) return;
        const activeAudio = audioClips.find(c => currentTime >= c.startTime && currentTime < c.startTime + (c.trimEnd - c.trimStart));

        if (activeAudio) {
            if (audioRef.current.src !== activeAudio.url) {
                audioRef.current.src = activeAudio.url;
            }
            const targetLocalTime = (currentTime - activeAudio.startTime) + activeAudio.trimStart;
            if (Math.abs(audioRef.current.currentTime - targetLocalTime) > 0.2) {
                audioRef.current.currentTime = targetLocalTime;
            }
            if (isPlaying && audioRef.current.paused) {
                audioRef.current.play().catch(e => console.log(e));
            } else if (!isPlaying && !audioRef.current.paused) {
                audioRef.current.pause();
            }
        } else {
            if (!audioRef.current.paused) audioRef.current.pause();
        }
    }, [currentTime, isPlaying, audioClips]);

    useEffect(() => {
        const video = videoRef.current;
        const clip = clips[activeClipIndex];
        if (!video || !clip) return;

        const targetTime = seekTimeRef.current ?? clip.trimStart;
        video.currentTime = targetTime;
        seekTimeRef.current = null;

        if (isPlaying) {
            switchingClipRef.current = true;
            video.play().then(() => {
                switchingClipRef.current = false;
            }).catch((error) => {
                switchingClipRef.current = false;
                console.error('Không thể phát clip tiếp theo:', error);
                setIsPlaying(false);
            });
        }
    }, [activeClipIndex, isPlaying]);

    const handleFileSelect = (e) => {
        const file = e.target.files[0];
        if (!file) return;
        if (isPlaying) togglePlay(); 
        
        const url = URL.createObjectURL(file);
        const video = document.createElement('video');
        video.src = url; video.muted = true; video.playsInline = true;
        
        video.onloadeddata = async () => {
            const newClip = { 
                id: Date.now(), 
                url, 
                originalDuration: video.duration,
                trimStart: 0,
                trimEnd: video.duration,
                duration: video.duration, 
                thumbnails: [],
                adjustments: {
                    brightness: 0,
                    contrast: 1,
                    saturation: 1,
                    grayscale: 0,
                    blur: 0,
                },
            };
            setClips(prev => {
                const newClips = [...prev, newClip];
                if (newClips.length === 1) { 
                    setCurrentTime(0); setActiveClipIndex(0);
                    if (timelineRef.current) timelineRef.current.scrollLeft = 0;
                }
                return newClips;
            });
            
            const canvas = document.createElement('canvas');
            const ctx = canvas.getContext('2d', { willReadFrequently: true });
            canvas.width = 240; canvas.height = (video.videoHeight / video.videoWidth) * 240 || 135;
            const numFrames = Math.min(Math.ceil(video.duration), 10);
            const step = video.duration / numFrames;
            const thumbs = [];
            for (let i = 0; i < numFrames; i++) {
                video.currentTime = i * step;
                await new Promise(r => { video.onseeked = r; });
                ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
                thumbs.push(canvas.toDataURL('image/jpeg', 0.88));
            }
            setClips(prev => prev.map(c => c.id === newClip.id ? { ...c, thumbnails: thumbs } : c));
        };
        e.target.value = null;
    };

    const handleAudioSelect = async (e) => {
        const file = e.target.files[0];
        if (!file) return;
        if (isPlaying) togglePlay(); 
        
        const url = URL.createObjectURL(file);
        const audio = new Audio(url);
        audio.onloadedmetadata = async () => {
            const dur = audio.duration;
            let waveformData = '';
            
            try {
                const arrayBuffer = await file.arrayBuffer();
                const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
                const audioBuffer = await audioCtx.decodeAudioData(arrayBuffer);
                const channelData = audioBuffer.getChannelData(0); 
                
                const expectedWidth = dur * pxPerSec;
                const canvasWidth = Math.min(expectedWidth, 3000); 
                const canvasHeight = 28;
                
                const canvas = document.createElement('canvas');
                canvas.width = canvasWidth; canvas.height = canvasHeight;
                const ctx = canvas.getContext('2d');
                
                ctx.fillStyle = 'rgba(36, 209, 204, 0.6)'; 
                const step = Math.ceil(channelData.length / canvasWidth);
                const amp = canvasHeight / 2;
                
                for (let i = 0; i < canvasWidth; i++) {
                    let min = 1.0; let max = -1.0;
                    for (let j = 0; j < step; j++) {
                        const datum = channelData[i * step + j];
                        if (datum < min) min = datum;
                        if (datum > max) max = datum;
                    }
                    ctx.fillRect(i, (1 + min) * amp, 1, Math.max(1, (max - min) * amp));
                }
                waveformData = canvas.toDataURL('image/png');
            } catch (err) { console.error(err); }

            let newStartTime = currentTime;
            const endOfLastAudio = audioClips.reduce((max, clip) => Math.max(max, clip.startTime + (clip.trimEnd - clip.trimStart)), 0);
            if (newStartTime < endOfLastAudio) newStartTime = endOfLastAudio; 

            const newAudio = {
                id: Date.now(), url, originalDuration: dur, trimStart: 0, trimEnd: dur,
                startTime: newStartTime, waveform: waveformData
            };
            setAudioClips(prev => [...prev, newAudio]);
        };
        e.target.value = null;
    };

    const handleSplit = () => {
        if (!selectedElement) {
            alert('Vui lòng chạm chọn một đoạn Video hoặc Âm thanh trước khi Tách!');
            return;
        }

        if (selectedElement.type === 'video') {
            const clipIdx = clips.findIndex(c => c.id === selectedElement.id);
            if (clipIdx === -1) return;

            const clipToSplit = clips[clipIdx];
            let clipGlobalStart = 0;
            for (let i = 0; i < clipIdx; i++) clipGlobalStart += clips[i].duration;
            
            const clipGlobalEnd = clipGlobalStart + clipToSplit.duration;

            if (currentTime > clipGlobalStart && currentTime < clipGlobalEnd) {
                const splitOffset = currentTime - clipGlobalStart; 
                const splitLocalTime = clipToSplit.trimStart + splitOffset; 

                const clip1 = { ...clipToSplit, trimEnd: splitLocalTime, duration: splitLocalTime - clipToSplit.trimStart };
                const clip2 = { ...clipToSplit, id: Date.now(), trimStart: splitLocalTime, duration: clipToSplit.trimEnd - splitLocalTime };

                setClips(prev => {
                    const newClips = [...prev];
                    newClips.splice(clipIdx, 1, clip1, clip2);
                    return newClips;
                });
                setSelectedElement(null);
            } else {
                alert('Cây kim thời gian không nằm ở trong đoạn video này!');
            }
        } else if (selectedElement.type === 'audio') {
            const clipToSplit = audioClips.find(c => c.id === selectedElement.id);
            if (!clipToSplit) return;

            const clipGlobalEnd = clipToSplit.startTime + (clipToSplit.trimEnd - clipToSplit.trimStart);
            if (currentTime > clipToSplit.startTime && currentTime < clipGlobalEnd) {
                const splitOffset = currentTime - clipToSplit.startTime;
                const splitLocalTime = clipToSplit.trimStart + splitOffset;

                const clip1 = { ...clipToSplit, trimEnd: splitLocalTime };
                const clip2 = { ...clipToSplit, id: Date.now(), trimStart: splitLocalTime, startTime: currentTime };

                setAudioClips(prev => {
                    const filtered = prev.filter(c => c.id !== clipToSplit.id);
                    return [...filtered, clip1, clip2];
                });
                setSelectedElement(null);
            } else {
                alert('Cây kim thời gian không nằm ở trong đoạn âm thanh này!');
            }
        }
    };

    const togglePlay = () => {
        if (videoRef.current) {
            if (isPlaying) {
                continuePlaybackRef.current = false;
                videoRef.current.pause();
                setIsPlaying(false);
            } else {
                continuePlaybackRef.current = true;
                videoRef.current.play().catch((error) => {
                    console.error('Không thể phát video:', error);
                    setIsPlaying(false);
                });
                setIsPlaying(true);
            }
        }
    };

    const toggleMute = () => setIsMuted(!isMuted);
    const formatTime = (time) => {
        if (!time || isNaN(time)) return '00:00';
        const m = Math.floor(time / 60).toString().padStart(2, '0');
        const s = Math.floor(time % 60).toString().padStart(2, '0');
        return `${m}:${s}`;
    };

    const handleTimeUpdate = (e) => {
        if (!isPlaying || isInteracting.current || resizeData.current.isResizing || dragAudioData.current.isActive || dragVideoData.current.isActive) return;
        
        const localTime = e.target.currentTime;
        const currentClip = clips[activeClipIndex];
        if (!currentClip) return;

        if (localTime >= currentClip.trimEnd) {
            if (activeClipIndex < clips.length - 1) {
                if (clipTransitionRef.current) return;
                clipTransitionRef.current = true;
                continuePlaybackRef.current = true;
                switchingClipRef.current = true;
                setActiveClipIndex(prev => prev + 1);
                seekTimeRef.current = clips[activeClipIndex + 1].trimStart; 
            } else {
                setIsPlaying(false);
                if (videoRef.current) videoRef.current.pause();
                if (audioRef.current) audioRef.current.pause();
            }
            return;
        }

        let globalTime = localTime - currentClip.trimStart;
        for (let i = 0; i < activeClipIndex; i++) globalTime += clips[i].duration;
        setCurrentTime(globalTime);
        if (timelineRef.current) timelineRef.current.scrollLeft = globalTime * pxPerSec;
    };

    const handleScroll = (e) => {
        if (
            dragTextData.current.isPending ||
            dragTextData.current.isActive ||
            dragOverlayData.current.isPending ||
            dragOverlayData.current.isActive ||
            resizeData.current.isResizing
        ) return;
        if (isPlaying) return; 
        let newGlobalTime = e.target.scrollLeft / pxPerSec;
        if (newGlobalTime < 0) newGlobalTime = 0;
        if (newGlobalTime > maxTimelineDuration) newGlobalTime = maxTimelineDuration;

        let acc = 0; let targetIndex = 0; let localTimeOffset = 0;
        for (let i = 0; i < clips.length; i++) {
            if (newGlobalTime <= acc + clips[i].duration) {
                targetIndex = i; localTimeOffset = newGlobalTime - acc; break;
            }
            acc += clips[i].duration;
        }

        if (targetIndex >= clips.length) {
            targetIndex = Math.max(0, clips.length - 1);
            localTimeOffset = clips[targetIndex]?.duration || 0;
        }

        if (clips[targetIndex]) {
            const actualVideoTime = clips[targetIndex].trimStart + localTimeOffset;
            if (targetIndex !== activeClipIndex) {
                seekTimeRef.current = actualVideoTime; setActiveClipIndex(targetIndex);
            } else {
                if (videoRef.current) videoRef.current.currentTime = actualVideoTime;
            }
        }
        setCurrentTime(newGlobalTime);
    };

    // ==========================================
    // SỰ KIỆN KÉO THẢ, CẮT XÉN CHO CẢ VIDEO LẪN AUDIO
    // ==========================================
    const handleAudioDragStart = (e, clip) => {
        e.stopPropagation(); setSelectedElement({ type: 'audio', id: clip.id });
        const pageX = e.pageX || (e.touches && e.touches[0].pageX);
        dragAudioData.current = { isPending: true, isActive: false, clipId: clip.id, startX: pageX, initialStartTime: clip.startTime };
    };

    const handleVideoDragStart = (e, clip) => {
        e.stopPropagation();
        setActiveClipIndex(clips.findIndex((item) => item.id === clip.id));
        setSelectedElement({ type: 'video', id: clip.id });
        const pageX = e.pageX || (e.touches && e.touches[0].pageX);
        dragVideoData.current = { isPending: true, isActive: false, clipId: clip.id, startX: pageX };
    };

    const handleOverlayDragStart = (e, layer) => {
        e.stopPropagation();
        setSelectedOverlayId(layer.id);
        setSelectedElement({ type: 'overlay', id: layer.id });
        const pageX = e.pageX || (e.touches && e.touches[0].pageX);
        dragOverlayData.current = {
            isPending: true,
            isActive: false,
            clipId: layer.id,
            startX: pageX,
            initialStartTime: layer.startTime,
        };
    };

    const handleTextDragStart = (e, layer) => {
        e.stopPropagation();
        e.preventDefault();
        setSelectedTextId(layer.id);
        setSelectedElement({ type: 'text', id: layer.id });
        const pageX = e.pageX || (e.touches && e.touches[0].pageX);
        dragTextData.current = {
            isPending: true,
            isActive: false,
            clipId: layer.id,
            startX: pageX,
            initialStartTime: layer.startTime,
        };
    };

    const updateCurrentAdjustments = (key, value) => {
        const numericValue = Number(value);
        setClips((current) => current.map((clip, index) => (
            index === activeClipIndex
                ? { ...clip, adjustments: { ...currentAdjustments, [key]: numericValue } }
                : clip
        )));
    };

    const resetCurrentAdjustments = () => {
        setClips((current) => current.map((clip, index) => (
            index === activeClipIndex
                ? {
                    ...clip,
                    adjustments: { brightness: 0, contrast: 1, saturation: 1, grayscale: 0, blur: 0 },
                }
                : clip
        )));
    };

    // Truyền thêm param `type` để biết là cắt Video, Audio hoặc Overlay
    const handleResizeStart = (e, clip, type) => {
        e.stopPropagation();
        resizeData.current = {
            isResizing: true,
            type: type, // 'video', 'audio' hoặc 'overlay'
            clipId: clip.id,
            startX: e.pageX || (e.touches && e.touches[0].pageX),
            startTrimEnd: clip.trimEnd
        };
    };

    const handleMouseDown = (e) => {
        isInteracting.current = true;
        startX.current = e.pageX - timelineRef.current.offsetLeft;
        scrollLeft.current = timelineRef.current.scrollLeft;
        if (isPlaying) togglePlay(); 
    };

    const handleMouseMove = (e) => {
        const pageX = e.pageX || (e.touches && e.touches.length > 0 ? e.touches[0].pageX : 0);
        
        // 1. Nếu đang kéo cắt (Trimming) cho Video HOẶC Audio
        if (resizeData.current.isResizing) {
            e.preventDefault(); e.stopPropagation();
            const deltaSec = (pageX - resizeData.current.startX) / pxPerSec;
            
            if (resizeData.current.type === 'audio') {
                setAudioClips(prev => prev.map(c => {
                    if (c.id === resizeData.current.clipId) {
                        let newTrim = resizeData.current.startTrimEnd + deltaSec;
                        if (newTrim > c.originalDuration) newTrim = c.originalDuration;
                        if (newTrim <= c.trimStart + 0.5) newTrim = c.trimStart + 0.5; 
                        return { ...c, trimEnd: newTrim };
                    }
                    return c;
                }));
            } else if (resizeData.current.type === 'overlay') {
                setOverlayLayers(prev => prev.map(layer => {
                    if (layer.id !== resizeData.current.clipId) return layer;
                    let newTrim = resizeData.current.startTrimEnd + deltaSec;
                    if (newTrim > MAX_LAYER_DURATION) newTrim = MAX_LAYER_DURATION;
                    if (newTrim <= layer.trimStart + 0.5) newTrim = layer.trimStart + 0.5;
                    return { ...layer, trimEnd: newTrim };
                }));
            } else if (resizeData.current.type === 'text') {
                setTextLayers(prev => prev.map(layer => {
                    if (layer.id !== resizeData.current.clipId) return layer;
                    let newTrim = resizeData.current.startTrimEnd + deltaSec;
                    if (newTrim > MAX_LAYER_DURATION) newTrim = MAX_LAYER_DURATION;
                    if (newTrim <= layer.trimStart + 0.5) newTrim = layer.trimStart + 0.5;
                    return { ...layer, trimEnd: newTrim };
                }));
            } else if (resizeData.current.type === 'video') {
                setClips(prev => prev.map(c => {
                    if (c.id === resizeData.current.clipId) {
                        let newTrim = resizeData.current.startTrimEnd + deltaSec;
                        if (newTrim > c.originalDuration) newTrim = c.originalDuration;
                        if (newTrim <= c.trimStart + 0.5) newTrim = c.trimStart + 0.5; 
                        // Đối với Video, phải cập nhật lại cả duration tổng
                        return { ...c, trimEnd: newTrim, duration: newTrim - c.trimStart };
                    }
                    return c;
                }));
            }
            return;
        }

        // 2. Kích hoạt Kéo Audio
        if (dragAudioData.current.isPending) {
            if (Math.abs(pageX - dragAudioData.current.startX) > 5) {
                dragAudioData.current.isActive = true; dragAudioData.current.isPending = false;
            }
        }
        if (dragAudioData.current.isActive) {
            e.preventDefault(); e.stopPropagation();
            const deltaSec = (pageX - dragAudioData.current.startX) / pxPerSec;
            setAudioClips(prev => prev.map(c => {
                if (c.id === dragAudioData.current.clipId) {
                    let newStart = dragAudioData.current.initialStartTime + deltaSec;
                    if (newStart < 0) newStart = 0; 
                    return { ...c, startTime: newStart };
                }
                return c;
            }));
            return;
        }

        if (dragOverlayData.current.isPending && Math.abs(pageX - dragOverlayData.current.startX) > 5) {
            dragOverlayData.current.isActive = true;
            dragOverlayData.current.isPending = false;
        }
        if (dragOverlayData.current.isActive) {
            e.preventDefault(); e.stopPropagation();
            const deltaSec = (pageX - dragOverlayData.current.startX) / pxPerSec;
            setOverlayLayers(prev => prev.map(layer => (
                layer.id === dragOverlayData.current.clipId
                    ? { ...layer, startTime: Math.max(0, dragOverlayData.current.initialStartTime + deltaSec) }
                    : layer
            )));
            return;
        }

        if (dragTextData.current.isPending && Math.abs(pageX - dragTextData.current.startX) > 5) {
            dragTextData.current.isActive = true;
            dragTextData.current.isPending = false;
        }
        if (dragTextData.current.isActive) {
            e.preventDefault(); e.stopPropagation();
            const deltaSec = (pageX - dragTextData.current.startX) / pxPerSec;
            setTextLayers(prev => prev.map(layer => (
                layer.id === dragTextData.current.clipId
                    ? { ...layer, startTime: Math.max(0, dragTextData.current.initialStartTime + deltaSec) }
                    : layer
            )));
            return;
        }

        // 3. Kích hoạt Kéo Video (Hoán đổi vị trí - Magnetic)
        if (dragVideoData.current.isPending) {
            if (Math.abs(pageX - dragVideoData.current.startX) > 5) {
                dragVideoData.current.isActive = true; dragVideoData.current.isPending = false;
            }
        }
        if (dragVideoData.current.isActive) {
            e.preventDefault(); e.stopPropagation();
            const deltaX = pageX - dragVideoData.current.startX;
            const currentIndex = clips.findIndex(c => c.id === dragVideoData.current.clipId);
            if (currentIndex === -1) return;

            if (deltaX > 40 && currentIndex < clips.length - 1) { 
                setClips(prev => {
                    const newArr = [...prev];
                    [newArr[currentIndex], newArr[currentIndex + 1]] = [newArr[currentIndex + 1], newArr[currentIndex]];
                    return newArr;
                });
                dragVideoData.current.startX = pageX; 
            } else if (deltaX < -40 && currentIndex > 0) { 
                setClips(prev => {
                    const newArr = [...prev];
                    [newArr[currentIndex], newArr[currentIndex - 1]] = [newArr[currentIndex - 1], newArr[currentIndex]];
                    return newArr;
                });
                dragVideoData.current.startX = pageX;
            }
            return;
        }

        // 4. Vuốt thanh Timeline bình thường
        if (!isInteracting.current) return;
        e.preventDefault();
        const walk = startX.current - (pageX - timelineRef.current.offsetLeft);
        timelineRef.current.scrollLeft = scrollLeft.current + walk;
    };

    const handleMouseUpOrLeave = () => { 
        if (dragAudioData.current.isActive) {
            setAudioClips(prev => {
                const sorted = [...prev].sort((a, b) => {
                    if (a.startTime === b.startTime) return a.id === dragAudioData.current.clipId ? -1 : 1;
                    return a.startTime - b.startTime;
                });
                let currentEnd = 0;
                return sorted.map(clip => {
                    let newStart = clip.startTime;
                    if (newStart < currentEnd) newStart = currentEnd;
                    currentEnd = newStart + (clip.trimEnd - clip.trimStart);
                    return { ...clip, startTime: newStart };
                });
            });
        }
        if (dragVideoData.current.isActive && timelineRef.current) {
            handleScroll({ target: { scrollLeft: timelineRef.current.scrollLeft } });
        }

        isInteracting.current = false; 
        resizeData.current.isResizing = false;
        dragAudioData.current.isPending = false; dragAudioData.current.isActive = false;
        dragVideoData.current.isPending = false; dragVideoData.current.isActive = false;
        dragOverlayData.current.isPending = false; dragOverlayData.current.isActive = false;
        dragTextData.current.isPending = false; dragTextData.current.isActive = false;
    };

    const handleTouchStart = (event) => {
        if (event.target.closest('[data-text-timeline-layer]')) return;
        isInteracting.current = true; 
        if (isPlaying) togglePlay(); 
    };

    const handleTimelineTouchMove = (event) => {
        if (
            event.target.closest('[data-text-timeline-layer], [data-overlay-timeline-layer]') ||
            dragTextData.current.isPending ||
            dragTextData.current.isActive ||
            dragOverlayData.current.isPending ||
            dragOverlayData.current.isActive ||
            resizeData.current.isResizing
        ) {
            event.preventDefault();
            event.stopPropagation();
        }
        handleMouseMove(event);
    };

    const renderTimeMarkers = () => {
        const markers = [];
        const step = maxTimelineDuration < 10 ? 1 : 2; 
        for (let i = 0; i <= maxTimelineDuration + 2; i += step) {
            markers.push(
                <div key={i} className="absolute text-[10px] text-gray-400" style={{ left: `${i * pxPerSec}px` }}>
                    <div className="w-[1px] h-1.5 bg-gray-500 mb-0.5"></div>
                    <span className="block -ml-2">{formatTime(i)}</span>
                </div>
            );
        }
        return markers;
    };

    const createTextOverlay = async (ffmpeg, fileName, layers) => {
        if (layers.length === 0) return false;

        const canvas = document.createElement('canvas');
        canvas.width = 1280;
        canvas.height = 720;
        const context = canvas.getContext('2d');
        if (!context) throw new Error('Không thể tạo lớp văn bản cho video.');

        context.clearRect(0, 0, canvas.width, canvas.height);
        context.textAlign = 'center';
        context.textBaseline = 'middle';
        context.font = 'bold 48px Arial, sans-serif';
        context.fillStyle = '#ffffff';
        context.strokeStyle = 'rgba(0, 0, 0, 0.85)';
        context.lineWidth = 5;
        context.lineJoin = 'round';

        for (const layer of layers) {
            context.save();
            context.translate((layer.x / 100) * canvas.width, (layer.y / 100) * canvas.height);
            context.rotate((layer.rotation * Math.PI) / 180);
            context.scale(layer.scale, layer.scale);
            context.strokeText(layer.text, 0, 0);
            context.fillText(layer.text, 0, 0);
            context.restore();
        }

        const blob = await new Promise((resolve, reject) => {
            canvas.toBlob((result) => {
                if (result) resolve(result);
                else reject(new Error('Không thể tạo ảnh văn bản cho video.'));
            }, 'image/png');
        });
        await ffmpeg.writeFile(fileName, new Uint8Array(await blob.arrayBuffer()));
        return true;
    };

    const handleExport = async () => {
        if (clips.length === 0) return fileInputRef.current.click();
        if (!loaded || isProcessing) return;

        exportCancelledRef.current = false;
        setIsProcessing(true);
        setExportProgress(5);
        setStatusText('Đang chuẩn bị video...');

        const temporaryFiles = [];
        const outputFile = `output_${Date.now()}.mp4`;

        try {
            const ffmpeg = ffmpegRef.current;
            const videoFilters = [];

            for (let i = 0; i < clips.length; i++) {
                const clipName = `video_${Date.now()}_${i}.mp4`;
                temporaryFiles.push(clipName);
                await ffmpeg.writeFile(clipName, await fetchFile(clips[i].url));
                setExportProgress(Math.min(20, 5 + Math.round(((i + 1) / clips.length) * 15)));
                videoFilters.push(
                    `[${i}:v]trim=start=${clips[i].trimStart}:end=${clips[i].trimEnd},` +
                    'setpts=PTS-STARTPTS,' +
                    'scale=1280:720:force_original_aspect_ratio=decrease,' +
                    'pad=1280:720:(ow-iw)/2:(oh-ih)/2,' +
                    `setsar=1,fps=30,eq=brightness=${clips[i].adjustments?.brightness || 0}:` +
                    `contrast=${clips[i].adjustments?.contrast || 1}:` +
                    `saturation=${clips[i].adjustments?.saturation || 1},` +
                    (clips[i].adjustments?.grayscale
                        ? `colorchannelmixer=rr=${1 - clips[i].adjustments.grayscale}:rg=${clips[i].adjustments.grayscale}:rb=${clips[i].adjustments.grayscale}:` +
                          `gr=${clips[i].adjustments.grayscale}:gg=${1 - clips[i].adjustments.grayscale}:gb=${clips[i].adjustments.grayscale}:` +
                          `br=${clips[i].adjustments.grayscale}:bg=${clips[i].adjustments.grayscale}:bb=${1 - clips[i].adjustments.grayscale},`
                        : '') +
                    (clips[i].adjustments?.blur ? `boxblur=${clips[i].adjustments.blur}:1,` : '') +
                    'format=yuv420p' +
                    `[v${i}]`
                );
            }

            const ffmpegArgs = [];
            clips.forEach((_, i) => ffmpegArgs.push('-i', temporaryFiles[i]));

            const overlayInputIndexes = [];
            for (let i = 0; i < overlayLayers.length; i++) {
                const layer = overlayLayers[i];
                const overlayName = `overlay_${Date.now()}_${i}.${layer.type === 'video' ? 'mp4' : 'png'}`;
                temporaryFiles.push(overlayName);
                await ffmpeg.writeFile(overlayName, await fetchFile(layer.file));
                if (layer.type === 'video') {
                    ffmpegArgs.push('-stream_loop', '-1', '-i', overlayName);
                } else {
                    ffmpegArgs.push('-loop', '1', '-i', overlayName);
                }
                overlayInputIndexes.push(clips.length + i);
            }

            const textInputIndexes = [];
            for (let i = 0; i < textLayers.length; i++) {
                const textOverlayFile = `text_overlay_${Date.now()}_${i}.png`;
                await createTextOverlay(ffmpeg, textOverlayFile, [textLayers[i]]);
                temporaryFiles.push(textOverlayFile);
                ffmpegArgs.push('-loop', '1', '-i', textOverlayFile);
                textInputIndexes.push(clips.length + overlayLayers.length + i);
            }

            const concatInputs = clips.map((_, i) => `[v${i}]`).join('');
            videoFilters.push(`${concatInputs}concat=n=${clips.length}:v=1:a=0[vconcat]`);
            let compositedVideo = '[vconcat]';
            overlayLayers.forEach((layer, i) => {
                const inputIndex = overlayInputIndexes[i];
                const overlayLabel = `overlay${i}`;
                const nextLabel = `composite${i}`;
                const angle = (layer.rotation * Math.PI) / 180;
                const duration = Math.max(0.5, layer.trimEnd - layer.trimStart);
                const start = Math.max(0, layer.startTime);
                const sourceFilter = layer.type === 'video'
                    ? `trim=start=${layer.trimStart}:end=${layer.trimEnd},`
                    : `trim=duration=${duration},`;
                videoFilters.push(
                    `[${inputIndex}:v]${sourceFilter}setpts=PTS-STARTPTS+${start}/TB,` +
                    `scale=iw*${layer.scale}:ih*${layer.scale},` +
                    `rotate=${angle}:fillcolor=none,` +
                    `format=rgba,colorchannelmixer=aa=${layer.opacity}[${overlayLabel}]`
                );
                videoFilters.push(
                    `${compositedVideo}[${overlayLabel}]overlay=` +
                    `x=main_w*${layer.x / 100}-overlay_w/2:` +
                    `y=main_h*${layer.y / 100}-overlay_h/2:eof_action=pass[${nextLabel}]`
                );
                compositedVideo = `[${nextLabel}]`;
            });
            textInputIndexes.forEach((inputIndex, i) => {
                const layer = textLayers[i];
                const duration = Math.max(0.5, layer.trimEnd - layer.trimStart);
                const start = Math.max(0, layer.startTime);
                const textLabel = `textoverlay${i}`;
                const nextLabel = `textcomposite${i}`;
                const angle = (layer.rotation * Math.PI) / 180;
                videoFilters.push(
                    `[${inputIndex}:v]trim=duration=${duration},setpts=PTS-STARTPTS+${start}/TB,` +
                    `scale=iw*${layer.scale}:ih*${layer.scale},rotate=${angle}:fillcolor=none,` +
                    `format=rgba[${textLabel}]`
                );
                videoFilters.push(
                    `${compositedVideo}[${textLabel}]overlay=` +
                    `x=main_w*${layer.x / 100}-overlay_w/2:` +
                    `y=main_h*${layer.y / 100}-overlay_h/2:eof_action=pass[${nextLabel}]`
                );
                compositedVideo = `[${nextLabel}]`;
            });
            videoFilters.push(`${compositedVideo}null[vout]`);

            if (audioClips.length > 0) {
                const audioFilters = [];
                const audioInputs = [];

                for (let i = 0; i < audioClips.length; i++) {
                    const clip = audioClips[i];
                    const audioName = `audio_${Date.now()}_${i}.mp3`;
                    temporaryFiles.push(audioName);
                    await ffmpeg.writeFile(audioName, await fetchFile(clip.url));
                    setExportProgress(Math.min(30, 20 + Math.round(((i + 1) / audioClips.length) * 10)));
                    ffmpegArgs.push('-i', audioName);

                    const audioInputIndex = clips.length + overlayLayers.length + textLayers.length + i;
                    const delayMs = Math.floor(clip.startTime * 1000);
                    const audioLabel = `a${i}`;
                    audioFilters.push(
                        `[${audioInputIndex}:a]atrim=start=${clip.trimStart}:end=${clip.trimEnd},` +
                        `asetpts=PTS-STARTPTS,adelay=${delayMs}|${delayMs}[${audioLabel}]`
                    );
                    audioInputs.push(`[${audioLabel}]`);
                }

                audioFilters.push(
                    `${audioInputs.join('')}amix=inputs=${audioClips.length}:` +
                    'dropout_transition=0:normalize=0[aout]'
                );
                ffmpegArgs.push(
                    '-filter_complex',
                    [...videoFilters, ...audioFilters].join(';')
                );
                ffmpegArgs.push(
                    '-map', '[vout]',
                    '-map', '[aout]',
                    '-c:v', 'libx264',
                    '-preset', 'superfast',
                    '-threads', '0',
                    '-crf', '23',
                    '-c:a', 'aac',
                    '-b:a', '192k',
                    '-movflags', '+faststart',
                    '-shortest'
                );
            } else {
                ffmpegArgs.push(
                    '-filter_complex', videoFilters.join(';'),
                    '-map', '[vout]',
                    '-c:v', 'libx264',
                    '-preset', 'superfast',
                    '-threads', '0',
                    '-crf', '23',
                    '-movflags', '+faststart'
                );
                if (isMuted) ffmpegArgs.push('-an');
            }

            ffmpegArgs.push(outputFile);
            temporaryFiles.push(outputFile);
            setExportProgress(35);
            setStatusText('Đang xuất video...');
            const exitCode = await ffmpeg.exec(ffmpegArgs);
            if (exitCode !== 0) {
                throw new Error(`FFmpeg không thể xuất video (mã lỗi ${exitCode}).`);
            }
            setExportProgress(80);

            const fileData = await ffmpeg.readFile(outputFile);
            const data = new Uint8Array(fileData);
            const exportedVideo = new Blob([data], { type: 'video/mp4' });
            const fileName = `ProCam_Merged_${Date.now()}.mp4`;
            let deviceSaveResult;
            try {
                deviceSaveResult = await saveVideoToDevice(data, fileName);
            } catch (saveError) {
                console.error('Không thể lưu video vào thư viện thiết bị:', saveError);
                deviceSaveResult = 'failed';
            }

            setStatusText('Đang tải video lên Cloudinary...');
            setExportProgress(85);
            const formData = new FormData();
            formData.append('video', exportedVideo, fileName);
            const uploadResponse = await fetch(apiUrl('/api/videos/upload'), {
                method: 'POST',
                headers: authHeaders(),
                body: formData,
            });
            const uploadData = await uploadResponse.json().catch(() => ({}));
            if (!uploadResponse.ok || !uploadData.success) {
                throw new Error(uploadData.message || `Upload video lên Cloudinary thất bại (${uploadResponse.status}).`);
            }

            setExportProgress(100);
            if (deviceSaveResult === 'gallery') {
                alert('Đã xuất video và lưu vào thư viện điện thoại (Movies/CameraApp), đồng thời lưu lên Cloudinary.');
            } else if (deviceSaveResult === 'download') {
                alert('Đã xuất video, tải xuống thiết bị và lưu lên Cloudinary thành công.');
            } else {
                alert('Đã lưu video lên Cloudinary nhưng không thể ghi vào thư viện điện thoại. Hãy cấp quyền lưu trữ rồi thử lại.');
            }
            navigate('/');
        } catch (err) {
            if (exportCancelledRef.current) return;
            console.error('Lỗi khi xuất video:', err);
            alert(err instanceof Error ? err.message : 'Không thể xuất video. Vui lòng thử lại.');
        } finally {
            const ffmpeg = ffmpegRef.current;
            for (const file of temporaryFiles) {
                try {
                    await ffmpeg.deleteFile(file);
                } catch (cleanupError) {
                    console.warn(`Không thể xóa file tạm ${file}:`, cleanupError);
                }
            }
            setIsProcessing(false);
            setExportProgress(0);
            setStatusText('Sẵn sàng xuất video');
        }
    };

    const handleCancelExport = () => {
        if (!isProcessing) return;

        exportCancelledRef.current = true;
        try {
            ffmpegRef.current.terminate();
        } catch (error) {
            console.warn('Không thể dừng tiến trình FFmpeg:', error);
        }
        setIsProcessing(false);
        setExportProgress(0);
        setStatusText('Đã hủy xuất video');
    };

    return (
        <div 
            className="bg-[#0a0a0c] text-white h-screen w-full flex flex-col font-sans selection:bg-[#ccff00] overflow-hidden"
            onClick={() => setSelectedElement(null)} 
        >
            <input type="file" accept="video/*" ref={fileInputRef} onChange={handleFileSelect} className="hidden" />
            <input type="file" accept="audio/*" ref={audioInputRef} onChange={handleAudioSelect} className="hidden" />
            <input type="file" accept="image/*,video/*" ref={overlayInputRef} onChange={handleOverlaySelect} className="hidden" />
            <audio ref={audioRef} />

            {isProcessing && (
                <div
                    className="fixed inset-0 z-[100] bg-black/90 backdrop-blur-sm flex items-center justify-center p-6"
                    role="status"
                    aria-live="polite"
                    aria-label="Đang xuất video"
                >
                    <div className="w-full max-w-md rounded-2xl border border-[#ccff00]/30 bg-[#141416] px-6 py-7 shadow-[0_0_40px_rgba(204,255,0,0.12)]">
                        <div className="flex flex-col items-center text-center">
                            <Loader2 size={42} className="text-[#ccff00] animate-spin mb-4" />
                            <h2 className="text-lg font-bold text-white">Đang xuất video</h2>
                            <p className="mt-2 text-sm text-gray-400">{statusText}</p>
                            <div className="mt-6 w-full">
                                <div className="flex justify-between text-xs text-gray-400 mb-2">
                                    <span>Tiến trình</span>
                                    <span className="text-[#ccff00] font-bold">{exportProgress}%</span>
                                </div>
                                <div className="h-3 w-full overflow-hidden rounded-full bg-[#2a2a2a]">
                                    <div
                                        className="h-full rounded-full bg-[#ccff00] transition-[width] duration-300"
                                        style={{ width: `${exportProgress}%` }}
                                    />
                                </div>
                            </div>
                            <p className="mt-5 text-xs text-gray-500">
                                Vui lòng không đóng trang hoặc thao tác trong lúc xử lý.
                            </p>
                            <button
                                type="button"
                                onClick={handleCancelExport}
                                className="mt-5 rounded-lg border border-red-400/60 px-5 py-2 text-sm font-semibold text-red-300 transition-colors hover:bg-red-400/10 active:scale-95"
                            >
                                Hủy xuất video
                            </button>
                        </div>
                    </div>
                </div>
            )}

            <header className="flex justify-between items-center px-4 py-3 shrink-0">
                <div className="flex items-center gap-5">
                    <button onClick={() => navigate(-1)} className="active:scale-90"><X size={24} /></button>
                    <button className="active:scale-90"><Search size={22} /></button>
                </div>
                <div className="flex items-center gap-3">
                    <Gem size={18} className="text-[#ccff00]" fill="#ccff00" fillOpacity={0.2} />
                    <button className="bg-[#2a2a2a] px-3 py-1.5 rounded flex items-center gap-1 text-xs font-semibold">
                        AI UHD <ChevronDown size={14} className="ml-1" />
                    </button>
                    <button onClick={handleExport} disabled={isProcessing || !loaded} className="bg-[#ccff00] text-black text-[13px] font-bold px-4 py-1.5 rounded active:scale-95 disabled:opacity-50">
                        {isProcessing ? 'Đang xuất...' : 'Xuất'}
                    </button>
                </div>
            </header>

            <main
                data-video-preview
                className="w-full h-[40vh] touch-manipulation bg-[#000000] flex items-center justify-center relative shrink-0"
                onClick={(e) => { e.stopPropagation(); togglePlay(); }}
                onPointerUp={(event) => { handleTextPointerUp(event); handleOverlayPointerUp(event); }}
                onPointerCancel={(event) => { handleTextPointerUp(event); handleOverlayPointerUp(event); }}
                onPointerMove={(event) => { handleTextPointerMove(event); handleOverlayPointerMove(event); }}
            >
                {!currentVideoSrc ? (
                    <button onClick={(e) => { e.stopPropagation(); fileInputRef.current.click(); }} className="flex flex-col items-center text-gray-500 active:scale-95">
                        <Video size={40} className="mb-2 opacity-50" />
                        <span className="text-sm">Nhấn để thêm video</span>
                    </button>
                ) : (
                    <video 
                    ref={videoRef} src={currentVideoSrc} playsInline preload="auto"
                        style={{
                            filter: `brightness(${100 + currentAdjustments.brightness * 100}%) ` +
                                `contrast(${currentAdjustments.contrast * 100}%) ` +
                                `saturate(${currentAdjustments.saturation * 100}%) ` +
                                `grayscale(${currentAdjustments.grayscale * 100}%) ` +
                                `blur(${currentAdjustments.blur}px)`,
                        }}
                        className="w-full h-full object-contain cursor-pointer"
                        autoPlay={isPlaying}
                        muted={isMuted || audioClips.length > 0} 
                        onPlay={() => setIsPlaying(true)}
                        onPause={() => {}}
                        onEnded={() => {
                            if (activeClipIndex < clips.length - 1) {
                                if (clipTransitionRef.current) return;
                                clipTransitionRef.current = true;
                                continuePlaybackRef.current = true;
                                switchingClipRef.current = true;
                                setActiveClipIndex(prev => prev + 1);
                                seekTimeRef.current = clips[activeClipIndex + 1].trimStart;
                            } else {
                                continuePlaybackRef.current = false;
                                setIsPlaying(false);
                            }
                        }}
                        onTimeUpdate={handleTimeUpdate}
                        onLoadedData={(e) => {
                            if (isPlaying || continuePlaybackRef.current) {
                                e.target.currentTime = clips[activeClipIndex]?.trimStart || 0;
                            }
                        }}
                        onCanPlay={(e) => {
                            if (isPlaying || continuePlaybackRef.current) {
                                e.target.play()
                                    .then(() => {
                                        switchingClipRef.current = false;
                                        continuePlaybackRef.current = false;
                                        clipTransitionRef.current = false;
                                    })
                                    .catch(err => {
                                        switchingClipRef.current = false;
                                        console.error('Không thể phát clip tiếp theo:', err);
                                        setIsPlaying(false);
                                        clipTransitionRef.current = false;
                                    });
                            } else {
                                switchingClipRef.current = false;
                                clipTransitionRef.current = false;
                            }
                        }}
                        key={clips[activeClipIndex]?.id}
                        onLoadedMetadata={(e) => {
                            if (seekTimeRef.current !== null) {
                                e.target.currentTime = seekTimeRef.current;
                                seekTimeRef.current = null;
                            } else {
                                e.target.currentTime = clips[activeClipIndex]?.trimStart || 0;
                            }
                            if (isPlaying || continuePlaybackRef.current) {
                                switchingClipRef.current = true;
                            }
                        }}
                    />
                )}
                <div className="absolute inset-0 pointer-events-none overflow-hidden">
                    {overlayLayers.map((layer) => {
                        const isSelected = selectedOverlayId === layer.id;
                        const isActive = currentTime >= layer.startTime &&
                            currentTime < layer.startTime + (layer.trimEnd - layer.trimStart);
                        return (
                            isActive && <div
                                key={layer.id}
                                className={`absolute pointer-events-auto touch-none select-none ${isSelected ? 'border border-[#ccff00] border-dashed' : ''}`}
                                style={{
                                    left: `${layer.x}%`,
                                    top: `${layer.y}%`,
                                    opacity: layer.opacity,
                                    transform: `translate(-50%, -50%) rotate(${layer.rotation}deg) scale(${layer.scale})`,
                                    transformOrigin: 'center',
                                }}
                                onPointerDown={(event) => handleOverlayPointerDown(event, layer)}
                                onClick={(event) => event.stopPropagation()}
                            >
                                {layer.type === 'video' ? (
                                    <video
                                        src={layer.url}
                                        muted
                                        autoPlay={isPlaying}
                                        playsInline
                                        className="pointer-events-none max-h-40 max-w-56 object-contain"
                                        onLoadedMetadata={(event) => {
                                            event.currentTarget.currentTime = layer.trimStart + Math.max(0, currentTime - layer.startTime);
                                        }}
                                    />
                                ) : (
                                    <img
                                        src={layer.url}
                                        alt="Lớp phủ"
                                        className="pointer-events-none max-h-40 max-w-56 object-contain"
                                    />
                                )}
                                {isSelected && (
                                    <>
                                        <button
                                            type="button"
                                            onPointerDown={(event) => event.stopPropagation()}
                                            onClick={(event) => deleteOverlay(event, layer.id)}
                                            className="absolute -right-3 -top-3 flex h-5 w-5 items-center justify-center rounded-full bg-red-500 text-white"
                                            aria-label="Xóa lớp phủ"
                                        >
                                            <X size={12} strokeWidth={3} />
                                        </button>
                                        <button
                                            type="button"
                                            onPointerDown={(event) => handleOverlayPointerDown(event, layer, 'scale')}
                                            className="absolute -bottom-2 -right-2 h-4 w-4 rounded-full border-2 border-black bg-[#ccff00]"
                                            aria-label="Phóng to hoặc thu nhỏ lớp phủ"
                                        />
                                        <button
                                            type="button"
                                            onPointerDown={(event) => handleOverlayPointerDown(event, layer, 'rotate')}
                                            className="absolute -top-7 left-1/2 h-4 w-4 -translate-x-1/2 rounded-full border-2 border-black bg-[#ccff00]"
                                            aria-label="Xoay lớp phủ"
                                        />
                                    </>
                                )}
                            </div>
                        );
                    })}
                    {textLayers.map((layer) => {
                        const isSelected = selectedTextId === layer.id;
                        const isActive = currentTime >= layer.startTime &&
                            currentTime < layer.startTime + (layer.trimEnd - layer.trimStart);
                        if (!isActive) return null;
                        return (
                            <div
                                key={layer.id}
                                className={`absolute pointer-events-auto touch-none select-none whitespace-nowrap ${isSelected ? 'border border-[#ccff00] border-dashed' : ''}`}
                                style={{
                                    left: `${layer.x}%`,
                                    top: `${layer.y}%`,
                                    transform: `translate(-50%, -50%) rotate(${layer.rotation}deg) scale(${layer.scale})`,
                                    transformOrigin: 'center',
                                }}
                                onPointerDown={(event) => handleTextPointerDown(event, layer)}
                                onClick={(event) => event.stopPropagation()}
                            >
                                <span className="px-2 py-1 text-2xl font-bold text-white drop-shadow-[0_2px_3px_rgba(0,0,0,0.9)]">
                                    {layer.text}
                                </span>
                                {isSelected && (
                                    <>
                                        <button
                                            type="button"
                                            aria-label="Xóa văn bản"
                                            onPointerDown={(event) => event.stopPropagation()}
                                            onClick={(event) => deleteSelectedText(event, layer.id)}
                                            className="absolute -right-3 -top-3 flex h-5 w-5 items-center justify-center rounded-full bg-red-500 text-white"
                                        >
                                            <X size={12} strokeWidth={3} />
                                        </button>
                                        <button
                                            type="button"
                                            aria-label="Phóng to hoặc thu nhỏ văn bản"
                                            onPointerDown={(event) => handleTextPointerDown(event, layer, 'scale')}
                                            className="absolute -bottom-2 -right-2 h-4 w-4 rounded-full border-2 border-black bg-[#ccff00]"
                                        />
                                        <button
                                            type="button"
                                            aria-label="Xoay văn bản"
                                            onPointerDown={(event) => handleTextPointerDown(event, layer, 'rotate')}
                                            className="absolute -top-7 left-1/2 h-4 w-4 -translate-x-1/2 rounded-full border-2 border-black bg-[#ccff00]"
                                        />
                                    </>
                                )}
                            </div>
                        );
                    })}
                </div>
                {isProcessing && (
                    <div className="absolute inset-0 bg-black/70 flex flex-col items-center justify-center z-20">
                        <Loader2 size={36} className="text-[#ccff00] animate-spin mb-2" />
                        <span className="text-[#ccff00] text-xs font-bold animate-pulse">{statusText}</span>
                    </div>
                )}
            </main>

            {isAdjustmentsOpen && clips[activeClipIndex] && (
                <div className="absolute left-3 right-3 top-[43vh] z-40 rounded-xl border border-white/10 bg-[#18181b]/95 p-4 shadow-xl backdrop-blur">
                    <div className="mb-3 flex items-center justify-between">
                        <h2 className="text-sm font-bold">Điều chỉnh video</h2>
                        <div className="flex items-center gap-3">
                            <button
                                type="button"
                                onClick={resetCurrentAdjustments}
                                className="text-xs text-[#ccff00]"
                            >
                                Đặt lại
                            </button>
                            <button
                                type="button"
                                onClick={() => setIsAdjustmentsOpen(false)}
                                aria-label="Đóng bảng điều chỉnh"
                                className="rounded-full p-1 text-gray-400 hover:bg-white/10 hover:text-white"
                            >
                                <X size={16} />
                            </button>
                        </div>
                    </div>
                    <div className="grid grid-cols-2 gap-x-4 gap-y-3">
                        {[
                            ['brightness', 'Ánh sáng', -1, 1, 0, 0.01],
                            ['contrast', 'Độ tương phản', 0, 2, 1, 0.01],
                            ['saturation', 'Độ bão hòa', 0, 2, 1, 0.01],
                            ['grayscale', 'Đen trắng', 0, 1, 0, 0.01],
                            ['blur', 'Làm mờ', 0, 8, 0, 0.1],
                        ].map(([key, label, min, max, defaultValue, step]) => (
                            <label key={key} className="text-xs text-gray-300">
                                <span className="mb-1 flex justify-between">
                                    <span>{label}</span>
                                    <span className="text-[#ccff00]">{currentAdjustments[key].toFixed(2)}</span>
                                </span>
                                <input
                                    type="range"
                                    min={min}
                                    max={max}
                                    step={step}
                                    value={currentAdjustments[key] ?? defaultValue}
                                    onChange={(event) => updateCurrentAdjustments(key, event.target.value)}
                                    className="w-full accent-[#ccff00]"
                                />
                            </label>
                        ))}
                    </div>
                </div>
            )}

            <div className="flex justify-between items-center px-4 py-3 shrink-0">
                <button className="active:scale-90 text-gray-300"><Maximize size={20} /></button>
                <button onClick={(e) => { e.stopPropagation(); togglePlay(); }} className="active:scale-90 text-white hover:text-[#ccff00]">
                    {isPlaying ? <Pause size={28} fill="currentColor" /> : <Play size={28} fill="currentColor" />}
                </button>
                <div className="flex gap-4 text-gray-400">
                    <button className="active:scale-90"><MonitorPlay size={20} /></button>
                    <button className="active:scale-90"><Undo size={20} /></button>
                    <button className="active:scale-90"><Redo size={20} /></button>
                </div>
            </div>

            <div className="flex-1 flex flex-col overflow-hidden relative border-t border-white/5 pt-1">
                <div className="flex justify-between items-center px-3 text-[10px] text-gray-400 mb-2">
                    <span>{formatTime(currentTime)} / {formatTime(maxTimelineDuration)}</span>
                </div>

                <div className="flex-1 relative overflow-hidden bg-[#121212]">
                    
                    {/* BẢN VÁ LỖI CÂY KIM (NÂNG z-index lên z-50) */}
                    <div 
                        className="absolute top-0 bottom-4 w-[1.5px] bg-white z-50 shadow-[0_0_5px_rgba(255,255,255,0.8)] -translate-x-1/2 pointer-events-none"
                        style={{ left: `${PLAYHEAD_OFFSET}px` }}
                    >
                        <div className="w-2.5 h-2.5 bg-white rounded-full absolute -top-1 -translate-x-[4.5px]"></div>
                    </div>

                    <div 
                        ref={timelineRef}
                        onClick={(e) => e.stopPropagation()} 
                        className="w-full h-full overflow-x-auto overflow-y-hidden hide-scrollbar flex touch-pan-x relative select-none"
                        onScroll={handleScroll}
                        onMouseDown={handleMouseDown}
                        onMouseMove={handleMouseMove}
                        onMouseUp={handleMouseUpOrLeave}
                        onMouseLeave={handleMouseUpOrLeave}
                        onTouchStart={handleTouchStart}
                        data-text-timeline-layer
                        onTouchMove={handleTimelineTouchMove}
                        onTouchEnd={(event) => {
                            event.stopPropagation();
                            handleMouseUpOrLeave(event);
                        }}
                        onTouchCancel={(event) => {
                            event.stopPropagation();
                            handleMouseUpOrLeave(event);
                        }}
                    >
                        <div className="shrink-0 pointer-events-none" style={{ width: `${PLAYHEAD_OFFSET}px` }}></div>

                        <div className="shrink-0 relative flex flex-col pt-1 pb-10" style={{ width: maxTimelineDuration > 0 ? `${maxTimelineDuration * pxPerSec + 100}px` : '100px' }}>
                            
                            <div className="absolute right-full top-[24px] flex gap-1.5 pr-1.5 h-14 z-10 w-[135px]">
                                <button onClick={(e) => { e.stopPropagation(); toggleMute(); }} className="flex flex-col items-center justify-center w-8 text-gray-400 shrink-0 active:scale-90">
                                    {isMuted ? <VolumeX size={16} className="text-[#ccff00]" /> : <Volume2 size={16} />}
                                    <span className="text-[8px] mt-1">{isMuted ? 'Bật' : 'Tắt'}</span>
                                </button>
                                
                                <button className="flex-1 bg-[#1c2414] rounded-lg p-1 relative flex flex-col items-center justify-center border border-white/5 shrink-0 active:scale-95">
                                    <div className="absolute -top-1.5 bg-[#f58122] text-white text-[8px] font-bold px-1 rounded-sm">New</div>
                                    <Scissors size={14} className="text-[#ccff00] mb-1" />
                                    <span className="text-[8px] text-center leading-tight text-gray-300">Cắt AI</span>
                                </button>

                                <button className="flex-1 bg-[#1e1e1e] rounded-lg p-1 flex flex-col items-center justify-center border border-white/5 shrink-0 active:scale-95">
                                    <ImageIcon size={14} className="text-gray-400 mb-1" />
                                    <span className="text-[8px] text-gray-300">Ảnh bìa</span>
                                </button>
                            </div>

                            <div className="order-1 h-4 relative w-full mb-2 pointer-events-none">
                                {maxTimelineDuration > 0 && renderTimeMarkers()}
                            </div>

                            {/* TRACK VIDEO: NÂNG CẤP KÉO (TRIM) GÓC PHẢI */}
                            <div className="order-2 h-14 mb-2 flex items-center relative w-full gap-0.5">
                                {clips.map((clip, idx) => {
                                    const isSelected = selectedElement?.type === 'video' && selectedElement.id === clip.id;
                                    
                                    return (
                                        <div 
                                            key={clip.id} 
                                            onMouseDown={(e) => handleVideoDragStart(e, clip)}
                                            onTouchStart={(e) => handleVideoDragStart(e, clip)}
                                            className={`h-full bg-[#2a2f3b] overflow-hidden relative flex shrink-0 rounded ${isSelected ? 'border-2 border-white z-20 shadow-[0_0_5px_rgba(255,255,255,0.8)]' : 'border border-white/30 z-10'} ${dragVideoData.current.isActive ? 'cursor-grabbing' : 'cursor-pointer'}`} 
                                            style={{ width: `${clip.duration * pxPerSec}px` }}
                                        >
                                            <div 
                                                className="absolute top-0 bottom-0 flex pointer-events-none"
                                                style={{ left: `${-clip.trimStart * pxPerSec}px`, width: `${clip.originalDuration * pxPerSec}px` }}
                                            >
                                                {clip.thumbnails.length > 0 ? (
                                                    clip.thumbnails.map((src, i) => (
                                                        <img key={i} src={src} className="h-full w-auto object-cover flex-1 opacity-100 [image-rendering:auto]" alt="thumb"/>
                                                    ))
                                                ) : (
                                                    <div className="w-full h-full flex items-center justify-center text-[10px] text-gray-500 animate-pulse bg-[#2a2f3b]">Đang nạp...</div>
                                                )}
                                            </div>

                                            {isSelected && (
                                                <button 
                                                    onMouseDown={(e) => e.stopPropagation()}
                                                    onTouchStart={(e) => e.stopPropagation()}
                                                    onClick={(e) => {
                                                        e.stopPropagation(); 
                                                        setClips(prev => prev.filter(c => c.id !== clip.id));
                                                        setSelectedElement(null);
                                                    }} 
                                                    className="absolute top-[2px] right-4 text-white hover:text-red-400 p-0.5 bg-black/50 rounded-full active:scale-90 z-30 cursor-pointer"
                                                >
                                                    <X size={10} strokeWidth={3} />
                                                </button>
                                            )}

                                            {/* THÊM THANH KÉO (RESIZE HANDLE) BÊN PHẢI CHO VIDEO */}
                                            {isSelected && (
                                                <div 
                                                    className="absolute right-0 top-0 bottom-0 w-3 cursor-ew-resize bg-white/90 z-20 flex items-center justify-center touch-none"
                                                    onMouseDown={(e) => handleResizeStart(e, clip, 'video')}
                                                    onTouchStart={(e) => handleResizeStart(e, clip, 'video')}
                                                >
                                                    <div className="w-[1.5px] h-3 bg-black rounded-full pointer-events-none"></div>
                                                </div>
                                            )}
                                        </div>
                                    )
                                })}
                                {clips.length > 0 && (
                                    <button 
                                        onClick={(e) => { e.stopPropagation(); fileInputRef.current.click(); }} 
                                        className="w-10 h-14 bg-[#1a1a1a] border border-white/20 border-dashed rounded flex flex-col items-center justify-center shrink-0 hover:bg-[#252525] active:scale-95 z-20"
                                    >
                                        <Plus size={18} className="text-gray-400" />
                                    </button>
                                )}
                            </div>

                            <div className="order-5 relative w-full h-[28px] bg-[#1a1a1a] rounded text-[11px] mb-1.5 border border-white/5">
                                {textLayers.length === 0 ? (
                                    <button
                                        onClick={(e) => { e.stopPropagation(); addTextLayer(); }}
                                        className="w-full h-full flex items-center px-2 text-gray-400 active:bg-[#252525]"
                                    >
                                        <Plus size={12} className="mr-1" /> Thêm văn bản
                                    </button>
                                ) : textLayers.map(layer => {
                                    const isSelected = selectedElement?.type === 'text' && selectedElement.id === layer.id;
                                    const width = Math.max(0.5, layer.trimEnd - layer.trimStart) * pxPerSec;
                                    return (
                                        <div
                                            key={layer.id}
                                            onMouseDown={(e) => handleTextDragStart(e, layer)}
                                            onTouchStart={(e) => handleTextDragStart(e, layer)}
                                            onTouchMove={handleTimelineTouchMove}
                                            onTouchEnd={handleMouseUpOrLeave}
                                            onTouchCancel={handleMouseUpOrLeave}
                                            className={`absolute top-0 bottom-0 touch-none overflow-hidden rounded-sm border-x text-[#ccff00] ${isSelected ? 'border-white z-20 shadow-[0_0_5px_rgba(204,255,0,0.8)]' : 'border-[#ccff00]/50 z-10'} ${dragTextData.current.isActive ? 'cursor-grabbing' : 'cursor-pointer'}`}
                                            style={{ left: `${layer.startTime * pxPerSec}px`, width: `${width}px` }}
                                        >
                                            <div className="flex h-full items-center gap-1 bg-[#ccff00]/10 px-1 pointer-events-none">
                                                <Type size={12} />
                                                <span className="truncate text-white">{layer.text}</span>
                                            </div>
                                            {isSelected && (
                                                <>
                                                    <button
                                                        onMouseDown={(e) => e.stopPropagation()}
                                                        onTouchStart={(e) => e.stopPropagation()}
                                                        onClick={(e) => deleteSelectedText(e, layer.id)}
                                                        className="absolute right-4 top-[2px] z-30 rounded-full bg-black/60 p-0.5 text-white hover:text-red-400"
                                                        aria-label="Xóa văn bản"
                                                    ><X size={10} strokeWidth={3} /></button>
                                                    <div
                                                        className="absolute right-0 top-0 bottom-0 z-20 flex w-2 cursor-ew-resize items-center justify-center bg-white/90"
                                                        onMouseDown={(e) => handleResizeStart(e, layer, 'text')}
                                                        onTouchStart={(e) => handleResizeStart(e, layer, 'text')}
                                                    ><div className="h-3 w-[1.5px] rounded-full bg-black" /></div>
                                                </>
                                            )}
                                        </div>
                                    );
                                })}
                            </div>

                            <div className="order-4 relative w-full h-[28px] bg-[#1a1a1a] rounded text-[11px] mb-1.5 border border-white/5">
                                {overlayLayers.length === 0 ? (
                                    <button
                                        onClick={(e) => { e.stopPropagation(); overlayInputRef.current.click(); }}
                                        className="w-full h-full flex items-center px-2 text-gray-400 active:bg-[#252525]"
                                    >
                                        <Plus size={12} className="mr-1" /> Thêm lớp phủ
                                    </button>
                                ) : overlayLayers.map(layer => {
                                    const isSelected = selectedElement?.type === 'overlay' && selectedElement.id === layer.id;
                                    const width = Math.max(0.5, layer.trimEnd - layer.trimStart) * pxPerSec;
                                    return (
                                        <div
                                            key={layer.id}
                                            onMouseDown={(e) => handleOverlayDragStart(e, layer)}
                                            onTouchStart={(e) => handleOverlayDragStart(e, layer)}
                                            data-overlay-timeline-layer
                                            onTouchMove={handleTimelineTouchMove}
                                            onTouchEnd={(event) => {
                                                event.stopPropagation();
                                                handleMouseUpOrLeave(event);
                                            }}
                                            onTouchCancel={(event) => {
                                                event.stopPropagation();
                                                handleMouseUpOrLeave(event);
                                            }}
                                            className={`absolute top-0 bottom-0 touch-none overflow-hidden rounded-sm border-x text-[#ccff00] ${isSelected ? 'border-white z-20 shadow-[0_0_5px_rgba(204,255,0,0.8)]' : 'border-[#ccff00]/50 z-10'} ${dragOverlayData.current.isActive ? 'cursor-grabbing' : 'cursor-pointer'}`}
                                            style={{ left: `${layer.startTime * pxPerSec}px`, width: `${width}px` }}
                                        >
                                            <div className="flex h-full items-center gap-1 bg-[#ccff00]/10 px-1 pointer-events-none">
                                                {layer.type === 'video' ? <Video size={12} /> : <ImageIcon size={12} />}
                                                <span className="truncate text-white">{layer.type === 'video' ? 'Video' : 'Ảnh'}</span>
                                            </div>
                                            {isSelected && (
                                                <>
                                                    <button
                                                        onMouseDown={(e) => e.stopPropagation()}
                                                        onTouchStart={(e) => e.stopPropagation()}
                                                        onClick={(e) => deleteOverlay(e, layer.id)}
                                                        className="absolute right-4 top-[2px] z-30 rounded-full bg-black/60 p-0.5 text-white hover:text-red-400"
                                                        aria-label="Xóa lớp phủ"
                                                    ><X size={10} strokeWidth={3} /></button>
                                                    <div
                                                        className="absolute right-0 top-0 bottom-0 z-20 flex w-2 cursor-ew-resize items-center justify-center bg-white/90"
                                                        onMouseDown={(e) => handleResizeStart(e, layer, 'overlay')}
                                                        onTouchStart={(e) => handleResizeStart(e, layer, 'overlay')}
                                                    ><div className="h-3 w-[1.5px] rounded-full bg-black" /></div>
                                                </>
                                            )}
                                        </div>
                                    );
                                })}
                            </div>

                            <div className="order-3 relative w-full h-[28px] bg-[#1a1a1a] rounded text-[11px] mb-1.5 border border-white/5">
                                {audioClips.length === 0 ? (
                                    <button 
                                        onClick={(e) => { e.stopPropagation(); audioInputRef.current.click(); }}
                                        className="w-full h-full flex items-center px-2 text-gray-400 active:bg-[#252525]"
                                    >
                                        <Plus size={12} className="mr-1" /> Thêm âm thanh
                                    </button>
                                ) : (
                                    <>
                                        {audioClips.map(clip => {
                                            const isSelected = selectedElement?.type === 'audio' && selectedElement.id === clip.id;
                                            const width = (clip.trimEnd - clip.trimStart) * pxPerSec;
                                            const leftOffset = clip.startTime * pxPerSec;
                                            const bgOffset = -clip.trimStart * pxPerSec; 
                                            const originalWidth = clip.originalDuration * pxPerSec;

                                            return (
                                                <div 
                                                    key={clip.id}
                                                    onMouseDown={(e) => handleAudioDragStart(e, clip)}
                                                    onTouchStart={(e) => handleAudioDragStart(e, clip)}
                                                    className={`absolute top-0 bottom-0 bg-[#24d1cc]/10 border-y ${isSelected ? 'border-white z-20 shadow-[0_0_5px_rgba(255,255,255,0.8)] border-x-2' : 'border-[#24d1cc]/50 z-10 border-x'} rounded-sm text-[#24d1cc] overflow-hidden group ${dragAudioData.current.isActive ? 'cursor-grabbing' : 'cursor-pointer'}`}
                                                    style={{ left: `${leftOffset}px`, width: `${width}px` }}
                                                >
                                                    {clip.waveform && (
                                                        <div 
                                                            className="absolute top-0 bottom-0 opacity-80 pointer-events-none"
                                                            style={{ 
                                                                left: `${bgOffset}px`, width: `${originalWidth}px`,
                                                                backgroundImage: `url(${clip.waveform})`, backgroundSize: '100% 100%' 
                                                            }}
                                                        />
                                                    )}
                                                    
                                                    <div className="flex items-center relative z-10 drop-shadow-md h-full px-1 pointer-events-none">
                                                        <Music size={12} className="mr-1 shrink-0" />
                                                        <span className="font-medium text-white shadow-black truncate">Audio</span>
                                                    </div>

                                                    {isSelected && (
                                                        <button 
                                                            onMouseDown={(e) => e.stopPropagation()}
                                                            onTouchStart={(e) => e.stopPropagation()}
                                                            onClick={(e) => {
                                                                e.stopPropagation(); 
                                                                setAudioClips(prev => prev.filter(c => c.id !== clip.id));
                                                                setSelectedElement(null);
                                                            }} 
                                                            className="absolute top-[2px] right-4 text-white hover:text-red-400 p-0.5 bg-black/50 rounded-full active:scale-90 z-30 cursor-pointer"
                                                        >
                                                            <X size={10} strokeWidth={3} />
                                                        </button>
                                                    )}

                                                    {isSelected && (
                                                        <div 
                                                            className="absolute right-0 top-0 bottom-0 w-3 cursor-ew-resize bg-white/90 z-20 flex items-center justify-center touch-none"
                                                            onMouseDown={(e) => handleResizeStart(e, clip, 'audio')}
                                                            onTouchStart={(e) => handleResizeStart(e, clip, 'audio')}
                                                        >
                                                            <div className="w-[1.5px] h-3 bg-black rounded-full pointer-events-none"></div>
                                                        </div>
                                                    )}
                                                </div>
                                            )
                                        })}
                                    </>
                                )}
                            </div>

                        </div>

                        <div className="shrink-0 pointer-events-none" style={{ width: `calc(100vw - ${PLAYHEAD_OFFSET}px)` }}></div>
                    </div>
                </div>
            </div>

            <div className="h-[72px] shrink-0 bg-[#000000] flex items-center overflow-x-auto hide-scrollbar px-2 gap-3 border-t border-white/5 pb-2 z-30 relative">
                {[
                    { icon: PlusSquare, label: 'Thêm video', action: (e) => { e.stopPropagation(); fileInputRef.current?.click(); } },
                    { 
                        icon: Scissors, 
                        label: 'Tách', 
                        action: (e) => { e.stopPropagation(); handleSplit(); },
                        activeColor: selectedElement ? 'text-[#ccff00]' : 'text-gray-400' 
                    },
                    { icon: Sliders, label: 'Chỉnh sửa', action: (e) => { e.stopPropagation(); setIsAdjustmentsOpen((open) => !open); } }, 
                    { icon: Music, label: 'Âm thanh', action: (e) => { e.stopPropagation(); audioInputRef.current?.click(); } },
                    { icon: Type, label: 'Văn bản', action: (e) => { e.stopPropagation(); addTextLayer(); } }, 
                    { icon: Layers, label: 'Lớp phủ', action: (e) => { e.stopPropagation(); overlayInputRef.current?.click(); } }, 
                    { icon: Subtitles, label: 'Phụ đề' },
                ].map((tool, i) => (
                    <button 
                        key={i} 
                        onClick={tool.action}
                        className="flex w-20 shrink-0 flex-col items-center justify-center text-gray-400 transition-all hover:text-white active:scale-90"
                    >
                        <tool.icon size={22} className="mb-1.5" />
                        <span className="text-[10px] leading-tight text-center">{tool.label}</span>
                    </button>
                ))}
            </div>
        </div>
    );
}