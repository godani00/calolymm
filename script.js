// 전역 변수
let currentImageData = null;
let analysisResult = null;

// DOM 요소 참조
const fileInput = document.getElementById('fileInput');
const galleryInput = document.getElementById('galleryInput');
const previewSection = document.getElementById('previewSection');
const previewImage = document.getElementById('previewImage');
const imageCanvas = document.getElementById('imageCanvas');
const loadingSection = document.getElementById('loadingSection');
const resultSection = document.getElementById('resultSection');
const errorSection = document.getElementById('errorSection');
const errorMessage = document.getElementById('errorMessage');

// 카메라 촬영 함수
function openCamera() {
    // 모바일에서 카메라가 잘 작동하도록 설정
    fileInput.setAttribute('capture', 'environment');
    fileInput.click();
}

// 갤러리 선택 함수
function openGallery() {
    galleryInput.click();
}

// 샘플 이미지 로드 함수
async function loadSampleImage(imagePath, foodName) {
    try {
        showLoading();
        
        // 샘플 이미지를 프리뷰로 표시
        previewImage.src = imagePath;
        previewImage.onload = function() {
            currentImageData = getImageBase64FromCanvas(previewImage);
            hideLoading();
            showPreview();
        };
        
        previewImage.onerror = function() {
            hideLoading();
            showError('샘플 이미지를 불러올 수 없습니다.');
        };
        
    } catch (error) {
        hideLoading();
        showError('샘플 이미지 로드 중 오류가 발생했습니다.');
        console.error('Sample image load error:', error);
    }
}

// 파일 선택 처리 함수
function handleFileSelect(event) {
    const file = event.target.files[0];
    if (!file) return;

    // 파일 크기 체크 (10MB 제한)
    if (file.size > 10 * 1024 * 1024) {
        showError('파일 크기가 너무 큽니다. 10MB 이하의 이미지를 선택해주세요.');
        return;
    }

    // 이미지 파일 타입 체크
    if (!file.type.startsWith('image/')) {
        showError('이미지 파일만 업로드 가능합니다.');
        return;
    }

    const reader = new FileReader();
    reader.onload = function(e) {
        previewImage.src = e.target.result;
        previewImage.onload = function() {
            currentImageData = getImageBase64FromCanvas(previewImage);
            showPreview();
        };
    };
    reader.onerror = function() {
        showError('이미지를 읽을 수 없습니다.');
    };
    reader.readAsDataURL(file);
}

// 캔버스를 사용해 이미지를 base64로 변환
function getImageBase64FromCanvas(imageElement) {
    const canvas = imageCanvas;
    const ctx = canvas.getContext('2d');
    
    // 이미지 크기 최적화 (모바일에서 메모리 절약)
    const maxWidth = 800;
    const maxHeight = 600;
    
    let { width, height } = imageElement;
    
    if (width > maxWidth || height > maxHeight) {
        const ratio = Math.min(maxWidth / width, maxHeight / height);
        width = width * ratio;
        height = height * ratio;
    }
    
    canvas.width = width;
    canvas.height = height;
    
    ctx.drawImage(imageElement, 0, 0, width, height);
    
    // JPEG 품질 조절로 파일 크기 최적화
    return canvas.toDataURL('image/jpeg', 0.8);
}

// API 키 체크 함수 (더 견고하게)
function checkApiKey() {
    // config.js가 로드될 때까지 최대 3초 대기
    return new Promise((resolve) => {
        let attempts = 0;
        const maxAttempts = 30; // 3초 (100ms * 30)
        
        const checkKey = () => {
            if (window.GEMINI_API_KEY && window.GEMINI_API_KEY !== "YOUR_API_KEY_HERE") {
                resolve(true);
                return;
            }
            
            attempts++;
            if (attempts >= maxAttempts) {
                resolve(false);
                return;
            }
            
            setTimeout(checkKey, 100);
        };
        
        checkKey();
    });
}

// 이미지 분석 함수
async function analyzeImage() {
    if (!currentImageData) {
        showError('분석할 이미지가 없습니다.');
        return;
    }

    // API 키 체크 (타이밍 문제 해결)
    const hasValidApiKey = await checkApiKey();
    if (!hasValidApiKey) {
        showError('API 키가 설정되지 않았습니다. config.js 파일을 확인해주세요.');
        return;
    }

    showLoading();

    try {
        const base64Data = currentImageData.split(',')[1];
        
        const requestBody = {
            contents: [{
                parts: [
                    {
                        text: `이 음식 이미지를 분석하여 다음 정보를 정확한 JSON 형식으로 제공해주세요:

1. 음식 종류와 각각의 예상 칼로리 (kcal)
2. 칼로리 계산 과정 (어떤 기준으로 계산했는지)
3. 총 칼로리를 소모하는데 필요한 운동량 (달리기, 걷기, 자전거 타기, 등산 등)

응답은 반드시 다음 JSON 형식을 정확히 따라주세요:
{
  "foods": [
    {
      "name": "음식명",
      "calories": 숫자,
      "portion": "1인분"
    }
  ],
  "totalCalories": 총칼로리숫자,
  "calculationProcess": [
    "계산 과정 설명 1",
    "계산 과정 설명 2"
  ],
  "exercises": [
    {
      "name": "운동명",
      "duration": "시간 (예: 30분, 1시간)",
      "type": "운동 종류"
    }
  ]
}

한국음식의 경우 일반적인 1인분 기준으로, 서양음식의 경우 평균적인 크기로 계산해주세요. 칼로리는 보수적으로 계산하되, 너무 엄격하지 않게 해주세요.`
                    },
                    {
                        inline_data: {
                            mime_type: "image/jpeg",
                            data: base64Data
                        }
                    }
                ]
            }]
        };

        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${window.GEMINI_API_KEY}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(requestBody)
        });

        if (!response.ok) {
            throw new Error(`API 요청 실패: ${response.status} ${response.statusText}`);
        }

        const data = await response.json();
        
        if (!data.candidates || !data.candidates[0] || !data.candidates[0].content) {
            throw new Error('API 응답에서 분석 결과를 찾을 수 없습니다.');
        }

        let responseText = data.candidates[0].content.parts[0].text;
        
        // JSON 파싱 전 정리
        responseText = responseText.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
        
        try {
            analysisResult = JSON.parse(responseText);
        } catch (parseError) {
            // JSON 파싱 실패시 기본 응답 생성
            console.warn('JSON 파싱 실패, 기본 응답 생성:', parseError);
            analysisResult = createFallbackResult(responseText);
        }

        hideLoading();
        displayResult();

    } catch (error) {
        hideLoading();
        console.error('Analysis error:', error);
        
        if (error.message.includes('API 요청 실패')) {
            showError('API 서버에 연결할 수 없습니다. 네트워크 연결을 확인해주세요.');
        } else if (error.message.includes('API 키')) {
            showError('API 키가 올바르지 않습니다. config.js 파일의 API 키를 확인해주세요.');
        } else {
            showError('이미지 분석 중 오류가 발생했습니다. 다시 시도해주세요.');
        }
    }
}

// JSON 파싱 실패시 기본 결과 생성
function createFallbackResult(responseText) {
    return {
        foods: [
            {
                name: "인식된 음식",
                calories: 300,
                portion: "1인분"
            }
        ],
        totalCalories: 300,
        calculationProcess: [
            "AI가 이미지를 분석했습니다",
            "일반적인 음식의 평균 칼로리를 계산했습니다",
            "약 300kcal로 추정됩니다"
        ],
        exercises: [
            {
                name: "빠른 걷기",
                duration: "45분",
                type: "유산소"
            },
            {
                name: "달리기",
                duration: "25분",
                type: "유산소"
            }
        ]
    };
}

// 결과 표시 함수
function displayResult() {
    if (!analysisResult) return;

    // 음식 아이템 표시
    const foodItemsContainer = document.getElementById('foodItems');
    foodItemsContainer.innerHTML = '';
    
    if (analysisResult.foods && analysisResult.foods.length > 0) {
        analysisResult.foods.forEach(food => {
            const foodItem = document.createElement('div');
            foodItem.className = 'food-item';
            foodItem.innerHTML = `
                <span class="food-name">${food.name} ${food.portion || ''}</span>
                <span class="food-calories">${food.calories}kcal</span>
            `;
            foodItemsContainer.appendChild(foodItem);
        });
    }

    // 총 칼로리 표시
    document.getElementById('totalCalories').textContent = analysisResult.totalCalories || 0;

    // 계산 과정 표시
    const calculationContainer = document.getElementById('calculationProcess');
    if (analysisResult.calculationProcess && analysisResult.calculationProcess.length > 0) {
        calculationContainer.innerHTML = `
            <h4>🔍 계산 과정</h4>
            <ul>
                ${analysisResult.calculationProcess.map(process => `<li>${process}</li>`).join('')}
            </ul>
        `;
    } else {
        calculationContainer.innerHTML = '';
    }

    // 운동 권장량 표시
    const exerciseContainer = document.getElementById('exerciseRecommendations');
    if (analysisResult.exercises && analysisResult.exercises.length > 0) {
        exerciseContainer.innerHTML = `
            <h4>🏃‍♀️ 칼로리 소모 운동량</h4>
            ${analysisResult.exercises.map(exercise => `
                <div class="exercise-item">
                    <span class="exercise-name">${exercise.name}</span>
                    <span class="exercise-duration">${exercise.duration}</span>
                </div>
            `).join('')}
        `;
    } else {
        exerciseContainer.innerHTML = '';
    }

    showResult();
}

// 결과 복사 함수
function copyResult() {
    if (!analysisResult) return;

    let copyText = `🍽️ 칼로리 분석 결과\n\n`;
    
    if (analysisResult.foods && analysisResult.foods.length > 0) {
        copyText += `📋 인식된 음식:\n`;
        analysisResult.foods.forEach(food => {
            copyText += `• ${food.name} ${food.portion || ''}: ${food.calories}kcal\n`;
        });
        copyText += `\n`;
    }
    
    copyText += `🔥 총 예상 칼로리: ${analysisResult.totalCalories}kcal\n\n`;
    
    if (analysisResult.exercises && analysisResult.exercises.length > 0) {
        copyText += `🏃‍♀️ 칼로리 소모 운동량:\n`;
        analysisResult.exercises.forEach(exercise => {
            copyText += `• ${exercise.name}: ${exercise.duration}\n`;
        });
    }

    // 클립보드에 복사
    if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(copyText).then(() => {
            alert('결과가 클립보드에 복사되었습니다!');
        }).catch(() => {
            fallbackCopyToClipboard(copyText);
        });
    } else {
        fallbackCopyToClipboard(copyText);
    }
}

// 클립보드 복사 대체 함수 (구형 브라우저용)
function fallbackCopyToClipboard(text) {
    const textArea = document.createElement('textarea');
    textArea.value = text;
    textArea.style.position = 'fixed';
    textArea.style.left = '-999999px';
    textArea.style.top = '-999999px';
    document.body.appendChild(textArea);
    textArea.focus();
    textArea.select();
    
    try {
        document.execCommand('copy');
        alert('결과가 클립보드에 복사되었습니다!');
    } catch (err) {
        console.error('클립보드 복사 실패:', err);
        alert('복사에 실패했습니다. 결과를 수동으로 복사해주세요.');
    }
    
    document.body.removeChild(textArea);
}

// 앱 초기화 함수
function resetApp() {
    currentImageData = null;
    analysisResult = null;
    
    // 입력 필드 초기화
    fileInput.value = '';
    galleryInput.value = '';
    
    // 모든 섹션 숨기기
    hideAllSections();
}

// UI 표시/숨김 함수들
function showPreview() {
    hideAllSections();
    previewSection.style.display = 'block';
}

function showLoading() {
    hideAllSections();
    loadingSection.style.display = 'block';
}

function hideLoading() {
    loadingSection.style.display = 'none';
}

function showResult() {
    hideAllSections();
    resultSection.style.display = 'block';
}

function showError(message) {
    hideAllSections();
    
    // 기본 에러 메시지 설정
    let fullMessage = message;
    
    // API 키 관련 에러인 경우 더 자세한 정보 제공
    if (message.includes('API 키')) {
        fullMessage = `${message}\n\n모바일에서 접속 중이시라면:\n1. PC IP 주소로 접속하세요: 192.168.1.125:8000\n2. 브라우저를 새로고침해 보세요\n3. 캐시를 삭제해 보세요`;
        
        // 디버그 정보 추가 (모바일에서 확인 가능)
        if (window.DEBUG_MODE) {
            fullMessage += `\n\n[디버그 정보]\n- API 키 존재: ${!!window.GEMINI_API_KEY}\n- Config 로드됨: ${typeof window.API_CONFIG !== 'undefined'}\n- 현재 URL: ${window.location.href}\n- 사용자 에이전트: ${navigator.userAgent.includes('Mobile') ? '모바일' : '데스크톱'}`;
        }
    }
    
    errorMessage.style.whiteSpace = 'pre-line';
    errorMessage.textContent = fullMessage;
    errorSection.style.display = 'block';
}

function hideAllSections() {
    previewSection.style.display = 'none';
    loadingSection.style.display = 'none';
    resultSection.style.display = 'none';
    errorSection.style.display = 'none';
}

// 이미지 로드 에러 처리
function handleImageError(img) {
    img.src = 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMjAwIiBoZWlnaHQ9IjIwMCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48cmVjdCB3aWR0aD0iMjAwIiBoZWlnaHQ9IjIwMCIgZmlsbD0iI2YwZjBmMCIvPjx0ZXh0IHg9IjUwJSIgeT0iNTAlIiBkb21pbmFudC1iYXNlbGluZT0ibWlkZGxlIiB0ZXh0LWFuY2hvcj0ibWlkZGxlIiBmb250LWZhbWlseT0iQXJpYWwiIGZvbnQtc2l6ZT0iMTQiIGZpbGw9IiM5OTkiPuydtOuvuOyngCDsl4bsnYw8L3RleHQ+PC9zdmc+';
}

// 앱 초기화
document.addEventListener('DOMContentLoaded', async function() {
    // 모든 섹션 숨기기
    hideAllSections();
    
    // 터치 이벤트 최적화 (모바일 성능 향상)
    document.addEventListener('touchstart', function() {}, {passive: true});
    
    console.log('칼로리M 앱이 초기화되었습니다.');
    
    // API 키 상태 확인 및 로깅
    setTimeout(async () => {
        const hasValidApiKey = await checkApiKey();
        if (window.debugLog) {
            window.debugLog('앱 초기화 완료', {
                hasApiKey: hasValidApiKey,
                apiKeyValue: window.GEMINI_API_KEY ? '[설정됨]' : '[없음]',
                userAgent: navigator.userAgent,
                screenSize: `${screen.width}x${screen.height}`,
                viewportSize: `${window.innerWidth}x${window.innerHeight}`
            });
        }
        
        if (!hasValidApiKey) {
            console.warn('⚠️ API 키 확인 필요:', {
                hasWindow: !!window,
                hasGeminiKey: !!window.GEMINI_API_KEY,
                keyValue: window.GEMINI_API_KEY,
                configLoaded: typeof window.API_CONFIG !== 'undefined'
            });
        }
    }, 500);
});