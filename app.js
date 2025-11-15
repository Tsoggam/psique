const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
let currentUserLevel = null;
let currentUser = null;
let allVideos = [];
let currentVideoIndex = -1;
let completedVideoIds = [];

const themeToggle = document.getElementById('theme-toggle');
const savedTheme = localStorage.getItem('theme') || 'light';
document.documentElement.setAttribute('data-theme', savedTheme);

// Restaurar modo de visualização
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

// Tabs
document.querySelectorAll('.tab').forEach(tab => {
    tab.addEventListener('click', (e) => {
        const tabName = e.target.dataset.tab;
        switchTab(tabName);
    });
});

// View Toggle
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
            badge.innerHTML = '<i class="fa-solid fa-p"></i>';
        }
        else if (currentUserLevel === 2) {
            badge.innerHTML = '<i class="fa-solid fa-a"></i>';
        }
        else {
            badge.innerHTML = '<i class="fa-solid fa-user"></i>';
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

    const defaultThumbnail = "https://arwzvqicgogyfxloolxt.supabase.co/storage/v1/object/public/thumbnail/logo-psique_.png";

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
        pdf: '📄', doc: '📝', docx: '📝',
        xls: '📊', xlsx: '📊',
        ppt: '📊', pptx: '📊',
        zip: '🗜️', rar: '🗜️',
        mp4: '🎥', mp3: '🎵',
        jpg: '🖼️', jpeg: '🖼️', png: '🖼️', gif: '🖼️'
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