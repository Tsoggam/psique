const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
let currentUserLevel = null;
let currentUser = null;
let allVideos = [];
let currentVideoIndex = -1;
let completedVideoIds = [];
let chatOpen = false;
let chatSubscription = null;
let chatMessages = [];
let isLoadingVideos = false;
let isLoadingFiles = false;
let isSendingMessage = false;
let isLoadingChat = false;
let subscribeTimeout = null;
let currentFilter = 'default';
let usersData = [];
let currentFolder = null;
let allFolders = [];
let allFiles = [];

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
document.getElementById('close-folder-btn')?.addEventListener('click', closeFolderModal);
document.querySelector('#folder-modal .modal-backdrop')?.addEventListener('click', closeFolderModal);

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

async function logUserActivity() {
    try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;

        await supabase
            .from('user_activity_logs')
            .upsert({
                user_id: user.id,
                last_login: new Date().toISOString()
            });
    } catch (error) {
        console.error('Erro ao registrar atividade:', error);
    }
}

async function handleLogout() {
    try {
        await supabase.auth.signOut();
        window.location.reload();
    } catch (error) {
        console.error('Erro no logout:', error);
        window.location.reload();
    }
}

async function showMemberScreen() {
    try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) throw new Error('Usuário não encontrado');

        currentUser = user;

        await logUserActivity();

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
            document.getElementById('admin-panel').style.display = 'none';
            document.querySelector('.container').style.display = 'block';
        }
        else if (currentUserLevel === 2) {
            badge.innerHTML = 'Administrativo';
            document.getElementById('admin-panel').style.display = 'none';
            document.querySelector('.container').style.display = 'block';
        }
        else if (currentUserLevel === 3) {
            badge.innerHTML = 'Desenvolvedor';

            document.getElementById('login-screen').classList.remove('active');
            document.getElementById('member-screen').classList.add('active');

            const mainContainer = document.querySelector('#member-screen > .container');
            if (mainContainer) mainContainer.style.display = 'none';

            const adminPanel = document.getElementById('admin-panel');
            if (adminPanel) {
                adminPanel.style.display = 'block';
                adminPanel.style.visibility = 'visible';
                adminPanel.style.opacity = '1';
            }

            await loadAdminDashboard();
            return;
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
    if (isLoadingVideos) {
        return;
    }
    isLoadingVideos = true;

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

        const videoHierarchy = organizeVideoHierarchy(videos);

        let flatIndex = 0;
        videoHierarchy.forEach(videoGroup => {
            const mainVideo = videoGroup.main;

            if (mainVideo.parent_video_id) {
                return;
            }

            const isCompleted = completedVideoIds.includes(mainVideo.id);
            const isUnlocked = mainVideo.unlocked === true || flatIndex === 0;
            const isLocked = !isUnlocked && flatIndex > 0 && !completedVideoIds.includes(allVideos[flatIndex - 1].id);

            const card = createVideoCard(mainVideo, flatIndex, isCompleted, isLocked, false);
            container.appendChild(card);
            flatIndex++;

            if (videoGroup.children && videoGroup.children.length > 0) {
                flatIndex += videoGroup.children.length;
            }
        });

        const savedView = localStorage.getItem('viewMode') || 'grid';
        if (savedView === 'list') {
            container.classList.add('list-view');
        }

    } catch (error) {
        console.error('Erro ao carregar vídeos:', error);
        loading.style.display = 'none';
        container.innerHTML = '<div class="empty-state"><p style="color: #e74c3c;">Erro ao carregar vídeos</p></div>';
    } finally {
        isLoadingVideos = false;
    }
}

function organizeVideoHierarchy(videos) {
    const hierarchy = [];
    const videoMap = new Map();

    videos.forEach(video => {
        videoMap.set(video.id, { main: video, children: [] });
    });

    videos.forEach(video => {
        if (video.parent_video_id) {
            const parent = videoMap.get(video.parent_video_id);
            if (parent) {
                parent.children.push(video);
            }
        } else {
            hierarchy.push(videoMap.get(video.id));
        }
    });

    hierarchy.forEach(group => {
        if (group.children.length > 0) {
            group.children.sort((a, b) => a.order_index - b.order_index);
        }
    });

    return hierarchy;
}

async function loadFiles() {
    if (isLoadingFiles) {
        return;
    }

    isLoadingFiles = true;
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

        const { data: folders, error: foldersError } = await supabase
            .from('folders')
            .select(`
                *,
                access_levels (name)
            `)
            .in('access_level_id', accessLevelIds)
            .order('created_at', { ascending: false });

        if (foldersError) throw foldersError;

        const { data: files, error: filesError } = await supabase
            .from('files')
            .select(`
                *,
                access_levels (name)
            `)
            .in('access_level_id', accessLevelIds)
            .order('created_at', { ascending: false });

        if (filesError) throw filesError;

        loading.style.display = 'none';

        allFolders = folders || [];
        allFiles = files || [];

        if (allFolders.length > 0) {
            allFolders.forEach(folder => {
                const card = createFolderCard(folder);
                container.appendChild(card);
            });
        }

        const standaloneFiles = allFiles.filter(f => !f.folder_id);

        if (standaloneFiles.length > 0) {
            standaloneFiles.forEach(file => {
                const card = createFileCard(file);
                container.appendChild(card);
            });
        }

        if (allFolders.length === 0 && standaloneFiles.length === 0) {
            noFiles.style.display = 'block';
            return;
        }

        const savedView = localStorage.getItem('viewMode') || 'grid';
        if (savedView === 'list') {
            container.classList.add('list-view');
        }

    } catch (error) {
        console.error('Erro ao carregar arquivos:', error);
        loading.style.display = 'none';
        container.innerHTML = '<div class="empty-state"><p style="color: #e74c3c;">Erro ao carregar materiais</p></div>';
    } finally {
        isLoadingFiles = false;
    }
}

function createVideoCard(video, index, isCompleted, isLocked, isSubVideo) {
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

    const sectionNumber = video.section_number || (index + 1);

    card.innerHTML = `
        <span class="section-badge">${sectionNumber}</span>
        
        <div class="video-thumbnail">
            <img src="${video.thumbnail_url || defaultThumbnail}" alt="${video.title}">
            ${!isLocked ? '<div class="play-icon">▶</div>' : ''}
        </div>

        ${isCompleted ? `
            <div class="completion-check">
                <i class="fa-regular fa-square-check"></i>
                <span>Concluído</span>
            </div>
        ` : ''}

        ${isLocked ? `
            <div class="completion-check locked-indicator">
                <i class="fa-solid fa-lock"></i>
                <span>Bloqueado</span>
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
        const isSubVideo = video.parent_video_id !== null;

        const item = document.createElement('div');
        item.className = 'playlist-item';
        item.setAttribute('role', 'button');
        item.setAttribute('tabindex', isLocked ? '-1' : '0');

        if (isCompleted) item.classList.add('completed');
        if (isLocked) item.classList.add('locked');
        if (isActive) item.classList.add('active');
        if (isSubVideo) item.classList.add('sub-video');

        const statusText = isLocked ? 'Bloqueado' : isCompleted ? 'Concluído' : 'Não iniciado';
        const sectionNumber = video.section_number || (index + 1);

        item.innerHTML = `
        <div class="playlist-item-number">${!isLocked && !isCompleted ? sectionNumber : ''}</div>
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
        .maybeSingle();

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

    if (document.getElementById('chat-toggle-btn')) {
        return;
    }

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

async function toggleChat() {
    chatOpen = !chatOpen;
    const modal = document.getElementById('chat-modal');
    const button = document.getElementById('chat-toggle-btn');

    if (chatOpen) {
        modal.classList.add('active');
        button.classList.add('active');
        document.getElementById('chat-input').focus();

        const badge = document.getElementById('chat-badge');
        badge.style.display = 'none';
        badge.textContent = '0';
    } else {
        modal.classList.remove('active');
        button.classList.remove('active');
    }
}

async function loadChatMessages() {

    if (isLoadingChat) {
        return;
    }
    isLoadingChat = true;

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
    } finally {
        isLoadingChat = false;
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

    if (isSendingMessage) {
        return;
    }

    const input = document.getElementById('chat-input');
    const message = input.value.trim();

    if (!message || !currentUser) return;

    isSendingMessage = true;

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
        isSendingMessage = false;
        sendBtn.disabled = false;
        sendBtn.innerHTML = originalContent;
        input.focus();
    }
}

async function subscribeToChatMessages() {
    if (subscribeTimeout) {
        clearTimeout(subscribeTimeout);
    }

    subscribeTimeout = setTimeout(async () => {
        if (chatSubscription) {
            await supabase.removeChannel(chatSubscription);
            chatSubscription = null;
        }

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
    }, 500);
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

    const chatBtn = document.getElementById('chat-toggle-btn');
    const chatModal = document.getElementById('chat-modal');

    if (!chatBtn) {
        createChatElements();
        await loadChatMessages();
        subscribeToChatMessages();
    } else {
        chatBtn.style.display = 'flex';
        if (chatModal) {
            chatModal.style.display = 'none';
            chatModal.classList.remove('active');
        }
        const badge = document.getElementById('chat-badge');
        if (badge) {
            badge.style.display = 'none';
            badge.textContent = '0';
        }
    }
};

const originalConsoleError = console.error;
console.error = function (...args) {
    const errorString = args.join(' ');

    if (
        errorString.includes('Content Security Policy') ||
        errorString.includes('frame-ancestors') ||
        errorString.includes('ssl.gstatic.com') ||
        errorString.includes('drive.google.com') ||
        errorString.includes('aria-hidden')
    ) {
        return;
    }

    originalConsoleError.apply(console, args);
};

const originalHandleLogout = handleLogout;
handleLogout = async function () {
    if (chatSubscription) {
        await supabase.removeChannel(chatSubscription);
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

async function loadAdminDashboard() {
    try {

        const [usersResult, videosResult, progressResult, activityResult] = await Promise.all([
            supabase.from('users').select('id, name, full_name'),
            supabase.from('videos').select('*'),
            supabase.from('video_progress').select('*'),
            supabase.from('user_activity_logs').select('user_id, last_login').order('last_login', { ascending: false })
        ]);

        if (usersResult.error) {
            console.error('❌ Erro ao buscar users:', usersResult.error);
            throw usersResult.error;
        }

        if (videosResult.error) {
            console.error('❌ Erro ao buscar videos:', videosResult.error);
        }

        const users = usersResult.data || [];
        const videos = videosResult.data || [];
        const allProgress = progressResult.data || [];
        const activities = activityResult.data || [];

        const activityMap = {};
        activities.forEach(activity => {
            if (!activityMap[activity.user_id]) {
                activityMap[activity.user_id] = activity.last_login;
            }
        });

        allProgress.forEach(progress => {
            if (!activityMap[progress.user_id] && progress.completed_at) {
                activityMap[progress.user_id] = progress.completed_at;
            }
        });

        const totalCompletions = allProgress.filter(p => p.completed).length;

        const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
        const activeUsers = users.filter(u => {
            const lastLogin = activityMap[u.id];
            return lastLogin && new Date(lastLogin) > sevenDaysAgo;
        }).length;

        document.getElementById('total-users').textContent = users.length;
        document.getElementById('total-videos').textContent = videos.length;
        document.getElementById('total-completions').textContent = totalCompletions;
        document.getElementById('active-users').textContent = activeUsers;

        await loadUserDetailsTable(users, videos.length, allProgress, activityMap);
        await loadProgressChart(users, videos.length, allProgress);
        await loadLevelDistributionChart(users);

        setupFilterDropdown();

    } catch (error) {
        console.error('❌ Erro ao carregar dashboard:', error);
        alert('Erro ao carregar o dashboard. Verifique o console para mais detalhes.');
    }
}

async function loadProgressChart(users, totalVideos, allProgress) {
    const container = document.getElementById('user-progress-chart');

    const userProgressData = users.map(user => {
        const completedCount = allProgress.filter(p => p.user_id === user.id && p.completed).length;
        const progressPercent = totalVideos > 0 ? Math.round((completedCount / totalVideos) * 100) : 0;
        return {
            name: user.full_name || user.name || `Usuário ${user.id.substring(0, 8)}`,
            progress: progressPercent,
            completed: completedCount
        };
    }).sort((a, b) => b.progress - a.progress).slice(0, 10);

    let chartHTML = '<div style="display: flex; flex-direction: column; gap: 15px;">';

    userProgressData.forEach((user, index) => {
        chartHTML += `
            <div style="display: flex; align-items: center; gap: 15px;">
                <div style="min-width: 30px; font-weight: 700; color: var(--primary);">#${index + 1}</div>
                <div style="flex: 1;">
                    <div style="display: flex; justify-content: space-between; margin-bottom: 5px;">
                        <span style="font-weight: 600; color: var(--text-dark);">${user.name}</span>
                        <span style="font-weight: 700; color: var(--primary);">${user.progress}%</span>
                    </div>
                    <div class="progress-bar">
                        <div class="progress-fill" style="width: ${user.progress}%"></div>
                    </div>
                    <small style="color: var(--text-gray); margin-top: 3px; display: block;">
                        ${user.completed} vídeos concluídos
                    </small>
                </div>
            </div>
        `;
    });

    chartHTML += '</div>';
    container.innerHTML = chartHTML;
}

async function loadUserDetailsTable(users, totalVideos, allProgress, activityMap) {
    const { data: accessData } = await supabase
        .from('user_access')
        .select('user_id, access_level_id, access_levels(name)');

    const accessMap = {};
    if (accessData) {
        accessData.forEach(a => {
            accessMap[a.user_id] = {
                level_id: a.access_level_id,
                level_name: a.access_levels?.name || 'Desconhecido'
            };
        });
    }

    usersData = users.map(user => {
        const userName = user.full_name || user.name || `Usuário ${user.id.substring(0, 8)}`;
        const userProgress = allProgress.filter(p => p.user_id === user.id && p.completed);
        const completedCount = userProgress.length;
        const progressPercent = totalVideos > 0 ? Math.round((completedCount / totalVideos) * 100) : 0;
        const accessInfo = accessMap[user.id] || { level_id: 0, level_name: 'Sem acesso' };

        let lastLogin = 'Nunca';
        let lastLoginRaw = null;
        if (activityMap[user.id]) {
            lastLoginRaw = activityMap[user.id];
            const loginDate = new Date(lastLoginRaw);
            lastLogin = loginDate.toLocaleString('pt-BR', {
                day: '2-digit',
                month: '2-digit',
                year: 'numeric',
                hour: '2-digit',
                minute: '2-digit'
            });
        }

        return {
            userName,
            accessInfo,
            progressPercent,
            completedCount,
            totalVideos,
            lastLogin,
            lastLoginRaw
        };
    });

    renderUsersTable(usersData);
}

async function loadProgressChart(users, totalVideos, allProgress) {
    const container = document.getElementById('user-progress-chart');

    const userProgressData = users.map(user => {
        const completedCount = allProgress.filter(p => p.user_id === user.id && p.completed).length;
        const progressPercent = totalVideos > 0 ? Math.round((completedCount / totalVideos) * 100) : 0;
        return {
            name: user.full_name || user.name || `Usuário ${user.id.substring(0, 8)}`,
            progress: progressPercent,
            completed: completedCount
        };
    }).sort((a, b) => b.progress - a.progress).slice(0, 10);

    let chartHTML = '<div style="display: flex; flex-direction: column; gap: 15px;">';

    userProgressData.forEach((user, index) => {
        chartHTML += `
            <div style="display: flex; align-items: center; gap: 15px;">
                <div style="min-width: 30px; font-weight: 700; color: var(--primary);">#${index + 1}</div>
                <div style="flex: 1;">
                    <div style="display: flex; justify-content: space-between; margin-bottom: 5px;">
                        <span style="font-weight: 600; color: var(--text-dark);">${user.name}</span>
                        <span style="font-weight: 700; color: var(--primary);">${user.progress}%</span>
                    </div>
                    <div class="progress-bar">
                        <div class="progress-fill" style="width: ${user.progress}%"></div>
                    </div>
                    <small style="color: var(--text-gray); margin-top: 3px; display: block;">
                        ${user.completed} vídeos concluídos
                    </small>
                </div>
            </div>
        `;
    });

    chartHTML += '</div>';
    container.innerHTML = chartHTML;
}

async function loadLevelDistributionChart(users) {
    const container = document.getElementById('level-distribution-chart');

    const { data: accessData } = await supabase
        .from('user_access')
        .select('access_level_id, access_levels(name)');

    const levelCounts = {
        1: { name: 'Psicólogos', count: 0, color: '#6B9B7C' },
        2: { name: 'Administrativo', count: 0, color: '#3498db' },
        3: { name: 'Desenvolvedores', count: 0, color: '#9b59b6' }
    };

    if (accessData) {
        accessData.forEach(a => {
            if (levelCounts[a.access_level_id]) {
                levelCounts[a.access_level_id].count++;
            }
        });
    }

    const total = Object.values(levelCounts).reduce((sum, level) => sum + level.count, 0);

    let chartHTML = '<div style="display: flex; flex-direction: column; gap: 20px;">';

    Object.values(levelCounts).forEach(level => {
        const percent = total > 0 ? Math.round((level.count / total) * 100) : 0;
        chartHTML += `
            <div>
                <div style="display: flex; justify-content: space-between; margin-bottom: 8px;">
                    <span style="font-weight: 600; color: var(--text-dark);">${level.name}</span>
                    <span style="font-weight: 700; color: ${level.color};">${level.count} usuários (${percent}%)</span>
                </div>
                <div class="progress-bar">
                    <div class="progress-fill" style="width: ${percent}%; background: ${level.color};"></div>
                </div>
            </div>
        `;
    });

    chartHTML += '</div>';
    container.innerHTML = chartHTML;
}

function setupFilterDropdown() {
    const filterBtn = document.getElementById('filter-btn');
    const filterMenu = document.getElementById('filter-menu');
    const filterOptions = document.querySelectorAll('.filter-option');

    if (!filterBtn || !filterMenu) return;

    filterBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        filterMenu.classList.toggle('active');
    });

    document.addEventListener('click', (e) => {
        if (!filterMenu.contains(e.target) && e.target !== filterBtn) {
            filterMenu.classList.remove('active');
        }
    });

    filterOptions.forEach(option => {
        option.addEventListener('click', () => {
            const filter = option.dataset.filter;
            currentFilter = filter;

            filterOptions.forEach(opt => opt.classList.remove('active'));
            option.classList.add('active');

            applyFilter(filter);
            filterMenu.classList.remove('active');
        });
    });
}

function applyFilter(filter) {
    let sortedUsers = [...usersData];

    switch (filter) {
        case 'level':
            sortedUsers.sort((a, b) => a.accessInfo.level_id - b.accessInfo.level_id);
            break;
        case 'recent':
            sortedUsers.sort((a, b) => {
                const dateA = a.lastLogin === 'Nunca' ? new Date(0) : new Date(a.lastLoginRaw);
                const dateB = b.lastLogin === 'Nunca' ? new Date(0) : new Date(b.lastLoginRaw);
                return dateB - dateA;
            });
            break;
        case 'alphabetical':
            sortedUsers.sort((a, b) => a.userName.localeCompare(b.userName));
            break;
        case 'completed':
            sortedUsers.sort((a, b) => b.completedCount - a.completedCount);
            break;
        default:
            break;
    }

    renderUsersTable(sortedUsers);
}

function renderUsersTable(users) {
    const container = document.getElementById('users-table');

    let tableHTML = `
        <table class="users-table">
            <thead>
                <tr>
                    <th>Usuário</th>
                    <th>Nível</th>
                    <th>Progresso</th>
                    <th>Vídeos Concluídos</th>
                    <th>Último Acesso</th>
                </tr>
            </thead>
            <tbody>
    `;

    users.forEach(user => {
        let levelClass = '';
        if (user.accessInfo.level_id === 1) levelClass = 'level-psicologos';
        else if (user.accessInfo.level_id === 2) levelClass = 'level-admin';
        else if (user.accessInfo.level_id === 3) levelClass = 'level-dev';

        tableHTML += `
            <tr>
                <td><strong>${user.userName}</strong></td>
                <td><span class="user-level-badge ${levelClass}">${user.accessInfo.level_name}</span></td>
                <td>
                    <div class="progress-bar">
                        <div class="progress-fill" style="width: ${user.progressPercent}%"></div>
                    </div>
                    <small style="color: var(--text-gray); margin-top: 5px; display: block;">${user.progressPercent}%</small>
                </td>
                <td><strong>${user.completedCount}</strong> / ${user.totalVideos}</td>
                <td>
                    <div class="last-login">
                        <i class="fa-solid fa-clock"></i>
                        ${user.lastLogin}
                    </div>
                </td>
            </tr>
        `;
    });

    tableHTML += `
            </tbody>
        </table>
    `;

    container.innerHTML = tableHTML;
}

function createFolderCard(folder) {
    const card = document.createElement('div');
    card.className = 'folder-card';

    const filesCount = allFiles.filter(f => f.folder_id === folder.id).length;

    card.innerHTML = `
        <div class="folder-icon">
            <i class="fa-solid fa-folder"></i>
        </div>
        <h3>${folder.name}</h3>
        <p>${folder.description || 'Sem descrição'}</p>
        <div class="folder-files-count">
            <i class="fa-solid fa-file"></i>
            <span>${filesCount} ${filesCount === 1 ? 'arquivo' : 'arquivos'}</span>
        </div>
    `;

    let clickTimeout;
    card.addEventListener('click', () => {
        if (clickTimeout) {
            clearTimeout(clickTimeout);
            clickTimeout = null;
            openFolderModal(folder);
        } else {
            clickTimeout = setTimeout(() => {
                clickTimeout = null;
            }, 300);
        }
    });

    return card;
}

async function openFolderModal(folder) {
    currentFolder = folder;
    const modal = document.getElementById('folder-modal');
    const loading = document.getElementById('folder-files-loading');
    const container = document.getElementById('folder-files-container');
    const noFiles = document.getElementById('folder-no-files');

    document.getElementById('folder-modal-title').textContent = folder.name;
    document.getElementById('folder-modal-description').textContent = folder.description || 'Sem descrição';

    loading.style.display = 'block';
    container.innerHTML = '';
    noFiles.style.display = 'none';

    modal.classList.add('active');
    document.body.style.overflow = 'hidden';

    try {
        const folderFiles = allFiles.filter(f => f.folder_id === folder.id);

        loading.style.display = 'none';

        if (folderFiles.length === 0) {
            noFiles.style.display = 'block';
            return;
        }

        folderFiles.forEach(file => {
            const fileCard = createFolderFileCard(file);
            container.appendChild(fileCard);
        });

    } catch (error) {
        console.error('Erro ao carregar arquivos da pasta:', error);
        loading.style.display = 'none';
        container.innerHTML = '<div class="empty-state"><p style="color: #e74c3c;">Erro ao carregar arquivos</p></div>';
    }
}

function createFolderFileCard(file) {
    const card = document.createElement('div');
    card.className = 'folder-file-card';

    const icon = getFileIcon(file.name);

    card.innerHTML = `
        <div class="folder-file-icon">${icon}</div>
        <div class="folder-file-info">
            <h4>${file.name}</h4>
            ${file.description ? `<p>${file.description}</p>` : ''}
        </div>
        <button onclick="downloadFile('${file.file_url}', '${file.name}')" class="btn-download-small" title="Baixar arquivo">
            <i class="fa-solid fa-download"></i>
        </button>
    `;

    return card;
}

function closeFolderModal() {
    const modal = document.getElementById('folder-modal');
    modal.classList.remove('active');
    document.body.style.overflow = 'auto';
    currentFolder = null;
}

function initAntiInspect() {
    const REDIRECT_URL = 'https://www.psiquebrasilia.com.br'
    let devToolsOpen = false;

    document.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        return false;
    });

    document.addEventListener('keydown', (e) => {
        if (e.key === 'F12' || e.keyCode === 123) {
            e.preventDefault();
            window.location.href = REDIRECT_URL;
            return false;
        }

        if (e.ctrlKey && (e.shiftKey || e.key === 'u' || e.key === 'U')) {
            if (['i', 'I', 'j', 'J', 'c', 'C', 'u', 'U'].includes(e.key)) {
                e.preventDefault();
                window.location.href = REDIRECT_URL;
                return false;
            }
        }
    });

    const threshold = 160;
    setInterval(() => {
        if (
            window.outerWidth - window.innerWidth > threshold ||
            window.outerHeight - window.innerHeight > threshold
        ) {
            if (!devToolsOpen) {
                devToolsOpen = true;
                window.location.href = REDIRECT_URL;
            }
        }
    }, 1000);

    const element = new Image();
    Object.defineProperty(element, 'id', {
        get: function () {
            if (!devToolsOpen) {
                devToolsOpen = true;
                window.location.href = REDIRECT_URL;
            }
        }
    });

    if (window.self !== window.top) {
        window.location.href = REDIRECT_URL;
    }

    document.addEventListener('selectstart', (e) => {
        const target = e.target;
        if (target.tagName === 'SCRIPT' || target.tagName === 'STYLE') {
            e.preventDefault();
            return false;
        }
    });

    let checkCount = 0;
    const detectDevTools = () => {
        const widthThreshold = window.outerWidth - window.innerWidth > threshold;
        const heightThreshold = window.outerHeight - window.innerHeight > threshold;

        if ((widthThreshold || heightThreshold) && checkCount > 2) {
            if (!devToolsOpen) {
                devToolsOpen = true;
                window.location.href = REDIRECT_URL;
            }
        }

        if (widthThreshold || heightThreshold) {
            checkCount++;
        } else {
            checkCount = 0;
        }
    };

    setInterval(detectDevTools, 500);
}

initAntiInspect();

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