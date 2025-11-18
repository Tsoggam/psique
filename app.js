const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
let currentUserLevel = null;
let currentUser = null;
let allVideos = [];
let currentVideoIndex = -1;
let completedVideoIds = [];
let chatOpen = false;
let chatSubscription = null;
let chatMessages = [];

const themeToggle = document.getElementById('theme-toggle');
const savedTheme = localStorage.getItem('theme') || 'light';
document.documentElement.setAttribute('data-theme', savedTheme);

const savedView = localStorage.getItem('viewMode') || 'grid';
if (savedView === 'list') {
    document.querySelector('[data-view="list"]')?.classList.add('active');
    document.querySelector('[data-view="grid"]')?.classList.remove('active');
}

themeToggle?.addEventListener('click', () => {
    const currentTheme = document.documentElement.getAttribute('data-theme');
    const newTheme = currentTheme === 'light' ? 'dark' : 'light';
    document.documentElement.setAttribute('data-theme', newTheme);
    localStorage.setItem('theme', newTheme);
});

window.addEventListener('DOMContentLoaded', async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (session) {
        await showMemberScreen();
    }
});

document.getElementById('login-form').addEventListener('submit', handleLogin);
document.getElementById('logout-btn').addEventListener('click', handleLogout);
document.getElementById('close-modal-btn').addEventListener('click', closeVideoModal);
document.getElementById('mark-complete-btn').addEventListener('click', markVideoComplete);
document.getElementById('next-video-btn').addEventListener('click', playNextVideo);

document.querySelectorAll('.tab').forEach(tab => {
    tab.addEventListener('click', (e) => {
        const tabName = e.target.dataset.tab;
        switchTab(tabName);
    });
});

document.querySelectorAll('.view-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
        const view = e.currentTarget.dataset.view;
        switchView(view);
    });
});

document.querySelector('.modal-backdrop')?.addEventListener('click', closeVideoModal);

async function handleLogin(event) {
    event.preventDefault();

    const email = document.getElementById('email').value;
    const password = document.getElementById('password').value;
    const errorDiv = document.getElementById('login-error');

    errorDiv.classList.remove('show');
    errorDiv.textContent = '';

    try {
        const { data, error } = await supabase.auth.signInWithPassword({
            email: email,
            password: password
        });

        if (error) throw error;

        await showMemberScreen();

    } catch (error) {
        errorDiv.textContent = 'Email ou senha incorretos. Tente novamente.';
        errorDiv.classList.add('show');
        console.error('Erro no login:', error);
    }
}

async function handleLogout() {
    if (chatOpen) {
        const modal = document.getElementById('chat-modal');
        const button = document.getElementById('chat-toggle-btn');
        if (modal) modal.classList.remove('active');
        if (button) button.classList.remove('active');
        chatOpen = false;
    }

    if (chatSubscription) {
        supabase.removeChannel(chatSubscription);
        chatSubscription = null;
    }

    await supabase.auth.signOut();
    currentUserLevel = null;
    currentUser = null;
    document.getElementById('login-screen').classList.add('active');
    document.getElementById('member-screen').classList.remove('active');
    document.getElementById('email').value = '';
    document.getElementById('password').value = '';
}

async function showMemberScreen() {
    try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) throw new Error('Usuário não encontrado');

        currentUser = user;

        const { data: userProfile } = await supabase
            .from('users')
            .select('name, full_name')
            .eq('id', user.id)
            .single();

        let displayName = '';
        if (userProfile?.full_name) {
            displayName = userProfile.full_name;
        } else if (userProfile?.name) {
            displayName = userProfile.name;
        } else if (user.user_metadata?.full_name) {
            displayName = user.user_metadata.full_name;
        } else if (user.user_metadata?.name) {
            displayName = user.user_metadata.name;
        } else {
            displayName = user.email.split('@')[0];
        }

        const capitalizeFirstLetter = (str) => {
            return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase();
        };

        const welcomeMessage = document.getElementById('welcome-message');
        const firstName = displayName.split(' ')[0];
        const formattedName = capitalizeFirstLetter(firstName);
        welcomeMessage.textContent = `Bem-vindo(a), ${formattedName}! 😊`;

        const { data: userAccess } = await supabase
            .from('user_access')
            .select('access_level_id, access_levels(name)')
            .eq('user_id', user.id);

        if (!userAccess || userAccess.length === 0) {
            throw new Error('Sem permissões de acesso');
        }

        currentUserLevel = userAccess[0].access_level_id;
        const levelName = userAccess[0].access_levels.name;

        const badge = document.getElementById('user-badge');

        if (currentUserLevel === 1) {
            badge.innerHTML = 'Psicólogos';
        }
        else if (currentUserLevel === 2) {
            badge.innerHTML = 'Administrativo';
        }
        else {
            badge.innerHTML = '<i class="fa-solid fa-exclamation"></i>';
        }

        document.getElementById('login-screen').classList.remove('active');
        document.getElementById('member-screen').classList.add('active');

        await loadVideos();
        await loadFiles();

    } catch (error) {
        console.error('Erro ao carregar área:', error);
        alert('Erro ao carregar sua área. Tente novamente.');
        await handleLogout();
    }
}


async function loadVideoFiles(videoId) {
    const container = document.getElementById('video-files-container');

    try {
        const { data: videoFiles, error } = await supabase
            .from('video_files')
            .select(`
                file_id,
                display_order,
                files (
                    id,
                    name,
                    description,
                    file_url
                )
            `)
            .eq('video_id', videoId)
            .order('display_order', { ascending: true });

        if (error) throw error;

        container.innerHTML = '';

        if (!videoFiles || videoFiles.length === 0) {
            container.style.display = 'none';
            return;
        }

        container.style.display = 'block';

        const header = document.createElement('div');
        header.className = 'video-files-header';
        header.innerHTML = `
            <h3>
        <i class="fa-solid fa-file-arrow-down"></i>
            </h3>
            <span class="files-count">${videoFiles.length} ${videoFiles.length === 1 ? 'arquivo' : 'arquivos'}</span>
        `;
        container.appendChild(header);

        const filesList = document.createElement('div');
        filesList.className = 'video-files-list';

        videoFiles.forEach(vf => {
            const file = vf.files;
            if (!file) return;

            const fileCard = document.createElement('div');
            fileCard.className = 'video-file-item';

            const icon = getFileIcon(file.name);

            fileCard.innerHTML = `
                <div class="video-file-icon">${icon}</div>
                <div class="video-file-info">
                    <h4>${file.name}</h4>
                    ${file.description ? `<p>${file.description}</p>` : ''}
                </div>
                <button onclick="downloadFile('${file.file_url}', '${file.name}')" class="btn-download" title="Baixar arquivo">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                        <polyline points="7 10 12 15 17 10"></polyline>
                        <line x1="12" y1="15" x2="12" y2="3"></line>
                    </svg>
                    <span>Baixar</span>
                </button>
            `;

            filesList.appendChild(fileCard);
        });

        container.appendChild(filesList);

    } catch (error) {
        console.error('Erro ao carregar arquivos do vídeo:', error);
        container.style.display = 'none';
    }
}

async function loadVideos() {
    const loading = document.getElementById('videos-loading');
    const container = document.getElementById('videos-container');
    const noVideos = document.getElementById('no-videos');

    loading.style.display = 'block';
    container.innerHTML = '';
    noVideos.style.display = 'none';

    try {
        const { data: userAccess } = await supabase
            .from('user_access')
            .select('access_level_id')
            .eq('user_id', currentUser.id);

        if (!userAccess || userAccess.length === 0) {
            loading.style.display = 'none';
            noVideos.style.display = 'block';
            return;
        }

        const accessLevelIds = userAccess.map(a => a.access_level_id);

        const { data: videos, error } = await supabase
            .from('videos')
            .select(`
                *,
                access_levels (name)
            `)
            .in('access_level_id', accessLevelIds)
            .order('order_index', { ascending: true });

        if (error) throw error;

        loading.style.display = 'none';

        if (!videos || videos.length === 0) {
            noVideos.style.display = 'block';
            return;
        }

        const { data: completedVideos } = await supabase
            .from('video_progress')
            .select('video_id')
            .eq('user_id', currentUser.id)
            .eq('completed', true);

        completedVideoIds = completedVideos?.map(v => v.video_id) || [];

        allVideos = videos;

        videos.forEach((video, index) => {
            const isCompleted = completedVideoIds.includes(video.id);
            const isLocked = index > 0 && !completedVideoIds.includes(videos[index - 1].id);
            const card = createVideoCard(video, index, isCompleted, isLocked);
            container.appendChild(card);
        });

        const savedView = localStorage.getItem('viewMode') || 'grid';
        if (savedView === 'list') {
            container.classList.add('list-view');
        }

    } catch (error) {
        console.error('Erro ao carregar vídeos:', error);
        loading.style.display = 'none';
        container.innerHTML = '<div class="empty-state"><p style="color: #e74c3c;">Erro ao carregar vídeos</p></div>';
    }
}

async function loadFiles() {
    const loading = document.getElementById('files-loading');
    const container = document.getElementById('files-container');
    const noFiles = document.getElementById('no-files');

    loading.style.display = 'block';
    container.innerHTML = '';
    noFiles.style.display = 'none';

    try {
        const { data: userAccess } = await supabase
            .from('user_access')
            .select('access_level_id')
            .eq('user_id', currentUser.id);

        if (!userAccess || userAccess.length === 0) {
            loading.style.display = 'none';
            noFiles.style.display = 'block';
            return;
        }

        const accessLevelIds = userAccess.map(a => a.access_level_id);

        const { data: files, error } = await supabase
            .from('files')
            .select(`
                *,
                access_levels (name)
            `)
            .in('access_level_id', accessLevelIds)
            .order('created_at', { ascending: false });

        if (error) throw error;

        loading.style.display = 'none';

        if (!files || files.length === 0) {
            noFiles.style.display = 'block';
            return;
        }

        files.forEach(file => {
            const card = createFileCard(file);
            container.appendChild(card);
        });

        const savedView = localStorage.getItem('viewMode') || 'grid';
        if (savedView === 'list') {
            container.classList.add('list-view');
        }

    } catch (error) {
        console.error('Erro ao carregar arquivos:', error);
        loading.style.display = 'none';
        container.innerHTML = '<div class="empty-state"><p style="color: #e74c3c;">Erro ao carregar materiais</p></div>';
    }
}

function createVideoCard(video, index, isCompleted, isLocked) {

    const defaultThumbnail = "https://hjeivflwulqtlkwvvmvw.supabase.co/storage/v1/object/public/thumbnail/Thumbnail.png";

    const card = document.createElement('div');
    card.className = 'content-card';

    if (isCompleted) card.classList.add('completed');
    if (isLocked) card.classList.add('locked');

    if (!isLocked) {
        card.onclick = () => openVideoModal(video, index);
    } else {
        card.onclick = () => {
            showToast('Você precisa completar a aula anterior para desbloquear este conteúdo.');
        };
    }

    card.innerHTML = `
        <div class="video-thumbnail">
            <img src="${defaultThumbnail}" alt="${video.title}">
            ${!isLocked ? '<div class="play-icon">▶</i></div>' : ''}
        </div>

        ${isCompleted ? `
            <div class="completion-check">
                <i class="fa-regular fa-square-check"></i>
                <span></span>
            </div>
        ` : ''}

        ${isLocked ? `
            <div class="completion-check locked-indicator">
                <i class="fa-solid fa-lock"></i>
                <span></span>
            </div>
        ` : ''}

        <h3>${video.title}</h3>
        <p>${video.description || 'Sem descrição'}</p>
    `;

    return card;
}

function createFileCard(file) {
    const card = document.createElement('div');
    card.className = 'file-card';

    const icon = getFileIcon(file.name);

    card.innerHTML = `
        <div class="file-icon">${icon}</div>
        <h3>${file.name}</h3>
        <p>${file.description || 'Sem descrição'}</p>
        <button onclick="downloadFile('${file.file_url}', '${file.name}')" class="btn">
        <i class="fa-solid fa-download"></i>
        </button>
    `;

    return card;
}

function createPlaylist() {
    const playlistContainer = document.getElementById('playlist-items');
    playlistContainer.innerHTML = '';

    const completedCount = completedVideoIds.length;
    document.getElementById('playlist-progress-text').textContent =
        `${completedCount} de ${allVideos.length} concluídas`;

    allVideos.forEach((video, index) => {
        const isCompleted = completedVideoIds.includes(video.id);
        const isLocked = index > 0 && !completedVideoIds.includes(allVideos[index - 1].id);
        const isActive = index === currentVideoIndex;

        const item = document.createElement('div');
        item.className = 'playlist-item';
        item.setAttribute('role', 'button');
        item.setAttribute('tabindex', isLocked ? '-1' : '0');

        if (isCompleted) item.classList.add('completed');
        if (isLocked) item.classList.add('locked');
        if (isActive) item.classList.add('active');

        const statusText = isLocked ? 'Bloqueado' : isCompleted ? 'Concluído' : 'Não iniciado';

        item.innerHTML = `
            <div class="playlist-item-number">${!isLocked && !isCompleted ? index + 1 : ''}</div>
            <div class="playlist-item-info">
                <div class="playlist-item-title">${video.title}</div>
                <div class="playlist-item-duration">${statusText}</div>
            </div>
        `;

        if (!isLocked) {
            item.onclick = () => {
                openVideoModal(video, index);
            };
            item.onkeypress = (e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                    openVideoModal(video, index);
                }
            };
        }

        playlistContainer.appendChild(item);
    });
}

async function openVideoModal(video, index) {
    currentVideoIndex = index;
    const modal = document.getElementById('video-modal');
    const player = document.getElementById('video-player');

    const { data: progressData } = await supabase
        .from('video_progress')
        .select('completed')
        .eq('user_id', currentUser.id)
        .eq('video_id', video.id)
        .single();

    const isCompleted = progressData?.completed || false;

    document.getElementById('video-title').textContent = video.title;
    document.getElementById('video-description').textContent = video.description || 'Sem descrição';

    const markCompleteBtn = document.getElementById('mark-complete-btn');
    const nextVideoBtn = document.getElementById('next-video-btn');
    const watchedIndicator = document.getElementById('video-watched-indicator');

    if (isCompleted) {
        markCompleteBtn.disabled = true;
        markCompleteBtn.innerHTML = `
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path>
                <polyline points="22 4 12 14.01 9 11.01"></polyline>
            </svg>
            <span>Concluída</span>
        `;
        watchedIndicator.classList.add('show');

        if (index < allVideos.length - 1) {
            nextVideoBtn.style.display = 'flex';
        } else {
            nextVideoBtn.style.display = 'none';
        }
    } else {
        markCompleteBtn.disabled = false;
        markCompleteBtn.innerHTML = `
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path>
                <polyline points="22 4 12 14.01 9 11.01"></polyline>
            </svg>
            <span>Marcar como concluído</span>
        `;
        watchedIndicator.classList.remove('show');
        nextVideoBtn.style.display = 'none';
    }

    renderVideoPlayer(player, video);

    await loadVideoFiles(video.id);

    createPlaylist();

    modal.classList.add('active');
    document.body.style.overflow = 'hidden';
}

function renderVideoPlayer(player, video) {
    const url = video.video_url;

    if (url.includes('youtube.com') || url.includes('youtu.be')) {
        const videoId = extractYouTubeId(url);
        player.innerHTML = `
            <iframe 
                src="https://www.youtube.com/embed/${videoId}?autoplay=1&rel=0&modestbranding=1&showinfo=0" 
                frameborder="0" 
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" 
                allowfullscreen
                title="Video player">
            </iframe>
        `;
    }

    else if (url.includes('vimeo.com')) {
        const videoId = url.split('/').pop().split('?')[0];
        player.innerHTML = `
            <iframe 
                src="https://player.vimeo.com/video/${videoId}?autoplay=1&title=0&byline=0&portrait=0" 
                frameborder="0" 
                allow="autoplay; fullscreen; picture-in-picture" 
                allowfullscreen
                title="Video player">
            </iframe>
        `;
    }

    else if (url.includes('drive.google.com')) {
        let embedUrl = url;

        if (url.includes('/file/d/')) {
            const fileId = url.split('/file/d/')[1].split('/')[0];
            embedUrl = `https://drive.google.com/file/d/${fileId}/preview`;
        } else if (url.includes('id=')) {
            const fileId = url.split('id=')[1].split('&')[0];
            embedUrl = `https://drive.google.com/file/d/${fileId}/preview`;
        } else if (url.includes('/view')) {
            embedUrl = url.replace('/view', '/preview');
        }

        player.innerHTML = `
            <iframe 
                src="${embedUrl}" 
                frameborder="0" 
                allow="autoplay" 
                allowfullscreen
                title="Video player"
                sandbox="allow-scripts allow-same-origin allow-presentation">
            </iframe>
        `;
    }

    else {
        player.innerHTML = `
            <video controls controlsList="nodownload" autoplay title="Video player">
                <source src="${url}" type="video/mp4">
                Seu navegador não suporta vídeo.
            </video>
        `;
    }
}

function closeVideoModal() {
    const modal = document.getElementById('video-modal');
    const player = document.getElementById('video-player');
    player.innerHTML = '';
    modal.classList.remove('active');
    document.body.style.overflow = 'auto';
}

async function markVideoComplete() {
    const video = allVideos[currentVideoIndex];
    const markCompleteBtn = document.getElementById('mark-complete-btn');
    const nextVideoBtn = document.getElementById('next-video-btn');
    const watchedIndicator = document.getElementById('video-watched-indicator');

    markCompleteBtn.disabled = true;
    markCompleteBtn.innerHTML = '<span>Salvando...</span>';

    try {
        const { error } = await supabase
            .from('video_progress')
            .upsert({
                user_id: currentUser.id,
                video_id: video.id,
                completed: true,
                completed_at: new Date().toISOString()
            }, {
                onConflict: 'user_id,video_id'
            });

        if (error) throw error;

        if (!completedVideoIds.includes(video.id)) {
            completedVideoIds.push(video.id);
        }

        markCompleteBtn.innerHTML = `
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path>
                <polyline points="22 4 12 14.01 9 11.01"></polyline>
            </svg>
            <span>Aula concluída</span>
        `;
        watchedIndicator.classList.add('show');

        if (currentVideoIndex < allVideos.length - 1) {
            nextVideoBtn.style.display = 'flex';
        }

        createPlaylist();

        await loadVideos();

        showToast('✅ Aula concluída! Próxima aula disponível.');

    } catch (error) {
        console.error('Erro ao marcar vídeo:', error);
        markCompleteBtn.disabled = false;
        markCompleteBtn.innerHTML = `
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path>
                <polyline points="22 4 12 14.01 9 11.01"></polyline>
            </svg>
            <span>Marcar concluída</span>
        `;
        showToast('❌ Erro ao salvar progresso. Tente novamente.');
    }
}

function playNextVideo() {
    if (currentVideoIndex < allVideos.length - 1) {
        const nextVideo = allVideos[currentVideoIndex + 1];
        closeVideoModal();
        setTimeout(() => {
            openVideoModal(nextVideo, currentVideoIndex + 1);
        }, 300);
    }
}

function extractYouTubeId(url) {
    const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|&v=)([^#&?]*).*/;
    const match = url.match(regExp);
    return (match && match[2].length === 11) ? match[2] : null;
}

function downloadFile(url, filename) {
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    link.target = '_blank';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}

function getFileIcon(filename) {
    const ext = filename.split('.').pop().toLowerCase();
    const icons = {
        pdf: '<i class="fa-solid fa-file-pdf"></i>',
        doc: '<i class="fa-solid fa-file"></i>',
        docx: '<i class="fa-regular fa-file-word"></i>',
        xls: '<i class="fa-solid fa-file-excel"></i>',
        xlsx: '<i class="fa-solid fa-file-excel"></i>',
        ppt: '<i class="fa-solid fa-file-powerpoint"></i>',
        pptx: '<i class="fa-solid fa-file-powerpoint"></i>',
        zip: '<i class="fa-solid fa-file-zipper"></i>',
        rar: '<i class="fa-solid fa-file-zipper"></i>',
        mp4: '<i class="fa-solid fa-file-video"></i>',
        mkv: '<i class="fa-solid fa-file-video"></i>',
        mp3: '<i class="fa-solid fa-file-audio"></i>',
        jpg: '<i class="fa-solid fa-file-image"></i>',
        jpeg: '<i class="fa-solid fa-file-image"></i>',
        png: '<i class="fa-solid fa-file-image"></i>',
        gif: '<i class="fa-solid fa-file-image"></i>'
    };
    return icons[ext] || '<i class="fa-regular fa-hard-drive"></i>';
}

function switchTab(tabName) {
    document.querySelectorAll('.tab').forEach(tab => {
        tab.classList.remove('active');
    });
    document.querySelector(`[data-tab="${tabName}"]`).classList.add('active');

    document.querySelectorAll('.tab-content').forEach(content => {
        content.classList.remove('active');
    });
    document.getElementById(`${tabName}-tab`).classList.add('active');
}

function switchView(view) {
    localStorage.setItem('viewMode', view);

    document.querySelectorAll('.view-btn').forEach(btn => {
        btn.classList.remove('active');
    });
    document.querySelector(`[data-view="${view}"]`).classList.add('active');

    const videosContainer = document.getElementById('videos-container');
    const filesContainer = document.getElementById('files-container');

    if (view === 'list') {
        videosContainer.classList.add('list-view');
        filesContainer.classList.add('list-view');
    } else {
        videosContainer.classList.remove('list-view');
        filesContainer.classList.remove('list-view');
    }
}

function showToast(message) {
    const existingToast = document.querySelector('.custom-toast');
    if (existingToast) {
        existingToast.remove();
    }

    const toast = document.createElement('div');
    toast.className = 'custom-toast';
    toast.style.cssText = `
        position: fixed;
        bottom: 30px;
        right: 30px;
        background: rgba(45, 52, 54, 0.95);
        color: white;
        padding: 16px 24px;
        border-radius: 12px;
        font-weight: 600;
        z-index: 10000;
        animation: slideInUp 0.3s ease;
        box-shadow: 0 10px 40px rgba(0, 0, 0, 0.3);
        max-width: 400px;
    `;
    toast.textContent = message;
    document.body.appendChild(toast);

    setTimeout(() => {
        toast.style.animation = 'slideOutDown 0.3s ease';
        setTimeout(() => {
            if (toast.parentNode) {
                document.body.removeChild(toast);
            }
        }, 300);
    }, 4000);
}

function createChatElements() {
    const chatButton = document.createElement('button');
    chatButton.id = 'chat-toggle-btn';
    chatButton.className = 'chat-toggle-btn';
    chatButton.innerHTML = `
        <i class="fa-solid fa-comment-dots fa-beat fa-2xl"></i>
        <span class="chat-badge" id="chat-badge" style="display: none;">0</span>
    `;

    const chatModal = document.createElement('div');
    chatModal.id = 'chat-modal';
    chatModal.className = 'chat-modal';
    chatModal.innerHTML = `
        <div class="chat-header">
            <div class="chat-header-info">
                <h3>CHAT PSIQUE 🌿</h3>
                <span class="chat-status">
                    <span class="status-dot"></span>
                    <span id="online-count">Carregando...</span>
                </span>
            </div>
            <button class="chat-close-btn" id="chat-close-btn">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <line x1="18" y1="6" x2="6" y2="18"></line>
                    <line x1="6" y1="6" x2="18" y2="18"></line>
                </svg>
            </button>
        </div>
        
        <div class="chat-messages" id="chat-messages">
            <div class="chat-loading">
                <div class="spinner"></div>
                <p>Carregando mensagens...</p>
            </div>
        </div>
        
        <div class="chat-input-container">
            <input 
                type="text" 
                id="chat-input" 
                placeholder="Digite sua mensagem..." 
                maxlength="500"
            />
            <button id="chat-send-btn" class="chat-send-btn">
                 <i class="fa-solid fa-share fa-bounce fa-xl"></i>
            </button>
        </div>
    `;

    document.body.appendChild(chatButton);
    document.body.appendChild(chatModal);

    chatButton.addEventListener('click', toggleChat);
    document.getElementById('chat-close-btn').addEventListener('click', toggleChat);
    document.getElementById('chat-send-btn').addEventListener('click', sendMessage);
    document.getElementById('chat-input').addEventListener('keypress', (e) => {
        if (e.key === 'Enter') sendMessage();
    });
}

function toggleChat() {
    chatOpen = !chatOpen;
    const modal = document.getElementById('chat-modal');
    const button = document.getElementById('chat-toggle-btn');

    if (chatOpen) {
        modal.classList.add('active');
        button.classList.add('active');
        loadChatMessages();
        subscribeToChatMessages();
        document.getElementById('chat-input').focus();

        const badge = document.getElementById('chat-badge');
        badge.style.display = 'none';
        badge.textContent = '0';
    } else {
        modal.classList.remove('active');
        button.classList.remove('active');
        if (chatSubscription) {
            supabase.removeChannel(chatSubscription);
            chatSubscription = null;
        }
    }
}

async function loadChatMessages() {
    const messagesContainer = document.getElementById('chat-messages');
    messagesContainer.innerHTML = '<div class="chat-loading"><div class="spinner"></div><p>Carregando...</p></div>';

    try {
        const { data: messages, error } = await supabase
            .from('chat_messages')
            .select('id, message, created_at, user_id')
            .order('created_at', { ascending: true })
            .limit(100);

        if (error) throw error;

        if (messages && messages.length > 0) {
            const userIds = [...new Set(messages.map(m => m.user_id))];

            const [usersResult, accessResult] = await Promise.all([
                supabase
                    .from('users')
                    .select('id, name, full_name')
                    .in('id', userIds),
                supabase
                    .from('user_access')
                    .select('user_id, access_level_id')
                    .in('user_id', userIds)
            ]);

            const usersMap = {};
            if (usersResult.data) {
                usersResult.data.forEach(u => {
                    usersMap[u.id] = u;
                });
            }

            const accessMap = {};
            if (accessResult.data) {
                accessResult.data.forEach(a => {
                    accessMap[a.user_id] = a.access_level_id;
                });
            }

            chatMessages = messages.map(msg => ({
                ...msg,
                users: usersMap[msg.user_id] ? {
                    ...usersMap[msg.user_id],
                    access_level_id: accessMap[msg.user_id] || null
                } : null
            }));
        } else {
            chatMessages = [];
        }

        renderChatMessages();
        updateOnlineCount();

    } catch (error) {
        console.error('Erro ao carregar mensagens:', error);
        messagesContainer.innerHTML = '<div class="chat-error">Erro ao carregar mensagens</div>';
    }
}

function renderChatMessages() {
    const messagesContainer = document.getElementById('chat-messages');
    messagesContainer.innerHTML = '';

    if (chatMessages.length === 0) {
        messagesContainer.innerHTML = `
            <div class="chat-empty">
                <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
                </svg>
                <p>Nenhuma mensagem ainda</p>
                <small>Seja o primeiro a enviar uma mensagem!</small>
            </div>
        `;
        return;
    }

    chatMessages.forEach(msg => {
        const messageEl = createMessageElement(msg);
        messagesContainer.appendChild(messageEl);
    });

    messagesContainer.scrollTop = messagesContainer.scrollHeight;
}

function createMessageElement(msg) {
    const messageDiv = document.createElement('div');
    const isOwn = msg.user_id === currentUser?.id;
    messageDiv.className = `chat-message ${isOwn ? 'own' : ''}`;

    let userName = 'Usuário';

    if (msg.users) {
        const fullName = msg.users.full_name || msg.users.name || 'Usuário';

        let userPrefix = '';
        if (msg.users.access_level_id === 1) {
            userPrefix = 'Psi | ';
        } else if (msg.users.access_level_id === 2) {
            userPrefix = 'Adm | ';
        }

        userName = userPrefix + fullName;
    }

    const time = new Date(msg.created_at).toLocaleTimeString('pt-BR', {
        hour: '2-digit',
        minute: '2-digit'
    });

    messageDiv.innerHTML = `
        <div class="message-content">
            ${!isOwn ? `<div class="message-author">${userName}</div>` : ''}
            <div class="message-text">${escapeHtml(msg.message)}</div>
            <div class="message-time">${time}</div>
        </div>
    `;

    return messageDiv;
}

async function sendMessage() {
    const input = document.getElementById('chat-input');
    const message = input.value.trim();

    if (!message || !currentUser) return;

    const sendBtn = document.getElementById('chat-send-btn');
    const originalContent = sendBtn.innerHTML;

    sendBtn.disabled = true;
    sendBtn.innerHTML = '<div class="spinner" style="width:20px;height:20px;border-width:2px;"></div>';

    try {
        const { error } = await supabase
            .from('chat_messages')
            .insert({
                user_id: currentUser.id,
                message: message
            });

        if (error) throw error;

        input.value = '';

    } catch (error) {
        console.error('Erro ao enviar mensagem:', error);
        showToast('❌ Erro ao enviar mensagem');
        sendBtn.innerHTML = originalContent;
    } finally {
        sendBtn.disabled = false;
        sendBtn.innerHTML = originalContent;
        input.focus();
    }
}

function subscribeToChatMessages() {
    chatSubscription = supabase
        .channel('chat_messages_channel')
        .on(
            'postgres_changes',
            {
                event: 'INSERT',
                schema: 'public',
                table: 'chat_messages'
            },
            async (payload) => {
                try {
                    const { data, error } = await supabase
                        .from('users')
                        .select(`
                            id,
                            name,
                            full_name,
                            user_access!inner (
                                access_level_id
                            )
                        `)
                        .eq('id', payload.new.user_id)
                        .single();

                    if (error) {
                        console.error('Erro ao buscar dados do usuário:', error);
                    }

                    const newMessage = {
                        id: payload.new.id,
                        message: payload.new.message,
                        created_at: payload.new.created_at,
                        user_id: payload.new.user_id,
                        users: data ? {
                            id: data.id,
                            name: data.name,
                            full_name: data.full_name,
                            access_level_id: data.user_access?.[0]?.access_level_id || null
                        } : null
                    };

                    chatMessages.push(newMessage);

                    const messagesContainer = document.getElementById('chat-messages');

                    const emptyState = messagesContainer.querySelector('.chat-empty');
                    if (emptyState) {
                        messagesContainer.innerHTML = '';
                    }

                    const messageEl = createMessageElement(newMessage);
                    messagesContainer.appendChild(messageEl);
                    messagesContainer.scrollTop = messagesContainer.scrollHeight;

                    if (!chatOpen && newMessage.user_id !== currentUser?.id) {
                        const badge = document.getElementById('chat-badge');
                        const currentCount = parseInt(badge.textContent) || 0;
                        badge.textContent = currentCount + 1;
                        badge.style.display = 'flex';
                    }
                } catch (error) {
                    console.error('Erro ao processar nova mensagem:', error);
                }
            }
        )
        .subscribe();
}

async function updateOnlineCount() {
    try {
        const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();

        const { data, error } = await supabase
            .from('chat_messages')
            .select('user_id')
            .gte('created_at', fiveMinutesAgo);

        if (!error && data) {
            const uniqueUsers = new Set(data.map(m => m.user_id));
            const count = uniqueUsers.size;
            document.getElementById('online-count').textContent =
                count === 1 ? '1 usuário ativo' : `${count} usuários ativos`;
        } else {
            document.getElementById('online-count').textContent = 'CHAT PSIQUE 🌿';
        }
    } catch (error) {
        document.getElementById('online-count').textContent = 'CHAT PSIQUE 🌿';
    }
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

const originalShowMemberScreen = showMemberScreen;
showMemberScreen = async function () {
    await originalShowMemberScreen.call(this);

    if (!document.getElementById('chat-toggle-btn')) {
        createChatElements();
    }
};

const originalHandleLogout = handleLogout;
handleLogout = async function () {
    if (chatSubscription) {
        supabase.removeChannel(chatSubscription);
        chatSubscription = null;
    }

    const chatBtn = document.getElementById('chat-toggle-btn');
    const chatModal = document.getElementById('chat-modal');
    if (chatBtn) chatBtn.remove();
    if (chatModal) chatModal.remove();

    chatOpen = false;
    chatMessages = [];

    await originalHandleLogout.call(this);
};

const style = document.createElement('style');
style.textContent = `
    @keyframes slideInUp {
        from {
            transform: translateY(100px);
            opacity: 0;
        }
        to {
            transform: translateY(0);
            opacity: 1;
        }
    }
    @keyframes slideOutDown {
        from {
            transform: translateY(0);
            opacity: 1;
        }
        to {
            transform: translateY(100px);
            opacity: 0;
        }
    }
`;
document.head.appendChild(style);