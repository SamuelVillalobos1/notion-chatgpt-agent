const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const { Client } = require('@notionhq/client');
const axios = require('axios');

// Cargar variables de entorno
dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());

// Configuración de clientes
const notion = new Client({ 
    auth: process.env.NOTION_TOKEN 
});
const DATABASE_ID = process.env.DATABASE_ID;
const TMDB_API_KEY = process.env.TMDB_API_KEY;

// Mapeo de nombres cortos a emails de personas
const PERSON_MAP = {
    'samu': 'svillalobos1221@gmail.com',
    'adri': 'adrianadiazv3003@gmail.com',
    'samuel': 'svillalobos1221@gmail.com',
    'adriana': 'adrianadiazv3003@gmail.com'
};

// Función para detectar persona en el texto
function detectPerson(title) {
    const lowerTitle = title.toLowerCase();
    
    // Buscar patrones como "por samu", "by adri", etc.
    const patterns = [
        /\s+por\s+(\w+)$/i,  // "Inception por samu"
        /\s+by\s+(\w+)$/i,   // "Inception by adri"  
        /\s+de\s+(\w+)$/i,   // "Inception de samu"
        /\s+-\s+(\w+)$/i     // "Inception - adri"
    ];
    
    for (const pattern of patterns) {
        const match = lowerTitle.match(pattern);
        if (match) {
            const personKey = match[1].toLowerCase();
            const cleanTitle = title.replace(pattern, '').trim();
            const personEmail = PERSON_MAP[personKey];
            
            if (personEmail) {
                return {
                    cleanTitle: cleanTitle,
                    personEmail: personEmail,
                    personName: personKey === 'samu' || personKey === 'samuel' ? 'Samuel Villalobos' : 'Adriana Diaz'
                };
            }
        }
    }
    
    // Si no se encuentra patrón, retornar título original sin persona
    return {
        cleanTitle: title,
        personEmail: null,
        personName: null
    };
}

// Mapeo de géneros TMDB a tus opciones exactas de Notion
const genreMap = {
    28: 'Action', 12: 'Action', 16: 'Comedy', 35: 'Comedy',
    80: 'Crime', 99: 'Drama', 18: 'Drama', 10751: 'Comedy',
    14: 'Science fiction', 36: 'Drama', 27: 'Horror', 10402: 'Drama',
    9648: 'Thriller', 10749: 'Romance', 878: 'Science fiction',
    10770: 'Drama', 53: 'Thriller', 10752: 'Action', 37: 'Action',
    // Series
    10759: 'Action', 10762: 'Comedy', 10763: 'Drama',
    10764: 'Comedy', 10765: 'Science fiction', 10766: 'Drama',
    10767: 'Comedy', 10768: 'Drama'
};

// Géneros válidos en tu Notion (exactamente como los tienes)
const VALID_GENRES = [
    'Drama', 'Science fiction', 'Dystopian', 'Romance', 
    'Horror', 'Action', 'Thriller', 'Crime', 'Superhero', 'Comedy'
];

// Géneros adicionales basados en palabras clave
function mapGenresByKeywords(overview, title) {
    const text = (overview + ' ' + title).toLowerCase();
    const genres = [];
    
    if (text.includes('superhero') || text.includes('marvel') || text.includes('dc comics') || 
        text.includes('batman') || text.includes('superman') || text.includes('spider') ||
        text.includes('avengers') || text.includes('iron man') || text.includes('captain america')) {
        genres.push('Superhero');
    }
    if (text.includes('dystopian') || text.includes('dystopia') || text.includes('apocalypse') ||
        text.includes('totalitarian') || text.includes('oppressive society')) {
        genres.push('Dystopian');
    }
    if (text.includes('future') || text.includes('space') || text.includes('alien') ||
        text.includes('technology') || text.includes('sci-fi')) {
        if (!genres.includes('Science fiction')) genres.push('Science fiction');
    }
    if (text.includes('love') || text.includes('romantic') || text.includes('relationship')) {
        if (!genres.includes('Romance')) genres.push('Romance');
    }
    if (text.includes('scary') || text.includes('haunted') || text.includes('demon') ||
        text.includes('ghost') || text.includes('monster')) {
        if (!genres.includes('Horror')) genres.push('Horror');
    }
    
    return genres;
}

// Función para obtener géneros mapeados
function getMappedGenres(genreIds, overview, title) {
    let genres = [];
    
    // Mapear géneros de TMDB a tus opciones
    if (genreIds && genreIds.length > 0) {
        genres = genreIds.map(id => genreMap[id]).filter(Boolean);
    }
    
    // Agregar géneros basados en palabras clave
    const keywordGenres = mapGenresByKeywords(overview, title);
    keywordGenres.forEach(genre => {
        if (!genres.includes(genre)) {
            genres.push(genre);
        }
    });
    
    // Filtrar solo géneros válidos en tu Notion
    genres = genres.filter(genre => VALID_GENRES.includes(genre));
    
    // Si no se encontraron géneros válidos, usar Drama como default
    if (genres.length === 0) {
        genres = ['Drama'];
    }
    
    // Limitar a máximo 3 géneros para evitar sobrecarga
    return genres.slice(0, 3).join(', ');
}

// Función para convertir rating de TMDB (0-10) a tu sistema de estrellas (1-5)
function convertRating(tmdbRating) {
    if (!tmdbRating || tmdbRating === 0) return 3; // Default 3 estrellas
    
    // Convertir de escala 0-10 a 1-5
    const convertedRating = Math.round((tmdbRating / 2));
    
    // Asegurar que esté en rango 1-5
    return Math.max(1, Math.min(5, convertedRating));
}

// Función para generar estrellas visuales
function generateStarRating(rating) {
    const stars = '⭐'.repeat(rating);
    return stars || '⭐⭐⭐'; // Default 3 estrellas si algo sale mal
}

// Ruta principal de prueba
app.get('/', (req, res) => {
    res.json({ 
        message: 'Notion ChatGPT Agent API funcionando correctamente',
        status: 'active',
        endpoints: ['/add-movie']
    });
});

// Endpoint principal para agregar películas/series
app.post('/add-movie', async (req, res) => {
    try {
        const { title, status } = req.body;
        
        if (!title) {
            return res.status(400).json({ 
                success: false, 
                error: 'El título es requerido' 
            });
        }

        // Detectar persona y limpiar título
        const { cleanTitle, personEmail, personName } = detectPerson(title);

        // Validar status si se proporciona
        const validStatuses = ['Unseen', 'Watching', 'Seen'];
        const movieStatus = status && validStatuses.includes(status) ? status : 'Unseen';

        console.log(`Buscando: ${cleanTitle}`);
        if (personName) console.log(`Agregado por: ${personName} (${personEmail})`);
        if (status) console.log(`Status solicitado: ${status}`);
        
        // Buscar información en TMDB con el título limpio
        const movieData = await searchMovieData(cleanTitle);
        movieData.status = movieStatus;
        movieData.personEmail = personEmail; // Agregar email para Notion Person field
        movieData.personName = personName; // Agregar nombre para mostrar
        console.log('Datos encontrados:', movieData.title);
        
        // Crear entrada en Notion
        const result = await createNotionPage(movieData);
        console.log('Página creada en Notion');
        
        const responseMessage = personName 
            ? `"${movieData.title}" agregada exitosamente por ${personName} con status: ${movieStatus}`
            : `"${movieData.title}" agregada exitosamente a la base de datos con status: ${movieStatus}`;
        
        res.json({ 
            success: true, 
            message: responseMessage,
            data: {
                title: movieData.title,
                type: movieData.type,
                releaseDate: movieData.releaseDate,
                rating: movieData.rating,
                status: movieStatus,
                addedBy: personName
            },
            notion_url: result.url 
        });
        
    } catch (error) {
        console.error('Error:', error.message);
        res.status(500).json({ 
            success: false, 
            error: error.message 
        });
    }
});

// Función para buscar datos de la película/serie
async function searchMovieData(title) {
    try {
        const response = await axios.get(
            `https://api.themoviedb.org/3/search/multi?api_key=${TMDB_API_KEY}&query=${encodeURIComponent(title)}&language=en-US`
        );
        
        const item = response.data.results[0];
        if (!item) {
            throw new Error('Película/Serie no encontrada en la base de datos');
        }
        
        const movieTitle = item.title || item.name;
        const overview = item.overview || 'Sin resumen disponible';
        const mediaType = item.media_type === 'movie' ? 'Movie' : 'Serie';
        
        // Obtener géneros como array para multi_select
        const genreString = getMappedGenres(item.genre_ids, overview, movieTitle);
        const genreArray = genreString.split(', ').filter(genre => genre.trim() !== '');
        
        return {
            title: movieTitle,
            releaseDate: item.release_date || item.first_air_date,
            type: mediaType,
            genre: genreString, // String para mostrar
            genreArray: genreArray, // Array para Notion multi_select
            summary: overview,
            cover: item.poster_path ? `https://image.tmdb.org/t/p/w500${item.poster_path}` : null,
            rating: convertRating(item.vote_average)
        };
    } catch (error) {
        throw new Error(`Error al buscar información: ${error.message}`);
    }
}

// Función para crear página en Notion
async function createNotionPage(data) {
    try {
        const properties = {
            // Title de la página (el nombre de la película/serie)
            'title': {
                title: [{ text: { content: data.title } }]
            },
            'Type': {
                select: { name: data.type } // "Movie" o "Serie"
            },
            'Genre': {
                multi_select: data.genreArray.map(genre => ({ name: genre.trim() }))
            },
            'Summary': {
                rich_text: [{ text: { content: data.summary } }]
            },
            'Status': {
                status: { name: data.status || 'Unseen' } // Tipo status con default "Unseen"
            },
            'Rating': {
                select: { name: generateStarRating(data.rating) } // "⭐⭐⭐⭐" en vez de "⭐4"
            }
        };

        // Agregar persona solo si existe
        if (data.personEmail) {
            // Para campo tipo "Person" en Notion usando email
            properties['Persona'] = {
                people: [{ 
                    object: "user", 
                    type: "person",
                    person: { email: data.personEmail }
                }]
            };
        }

        // Agregar fecha solo si existe
        if (data.releaseDate) {
            properties['Release date'] = {
                date: { start: data.releaseDate }
            };
        }

        // Agregar cover solo si existe
        if (data.cover) {
            properties['Cover'] = {
                files: [
                    {
                        type: "external",
                        name: `${data.title} - Poster`,
                        external: {
                            url: data.cover
                        }
                    }
                ]
            };
        }

        // Crear la página en Notion
        const result = await notion.pages.create({
            parent: { database_id: DATABASE_ID },
            properties: properties
        });

        // Después de crear la página, agregar el ícono apropiado
        await addPageIcon(result.id, data.type);

        return result;
    } catch (error) {
        console.error('Detalles del error de Notion:', error.body || error.message);
        throw new Error(`Error al crear página en Notion: ${error.message}`);
    }
}

// Función para agregar íconos a las páginas
async function addPageIcon(pageId, type) {
    try {
        let icon;
        
        if (type === 'Movie') {
            // Ícono para películas
            icon = {
                type: "emoji",
                emoji: "🎥"
            };
        } else {
            // Ícono para series  
            icon = {
                type: "emoji", 
                emoji: "🎭"
            };
        }

        await notion.pages.update({
            page_id: pageId,
            icon: icon
        });

        console.log(`Ícono ${icon.emoji} agregado para ${type}`);
    } catch (error) {
        console.error('Error al agregar ícono:', error.message);
        // No lanzamos error aquí para que no falle toda la operación
    }
}

// Manejo de errores global
app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(500).json({ 
        success: false, 
        error: 'Error interno del servidor' 
    });
});

// Iniciar servidor
app.listen(PORT, () => {
    console.log(`Servidor ejecutándose en puerto ${PORT}`);
    console.log(`Entorno: ${process.env.NODE_ENV || 'development'}`);
});