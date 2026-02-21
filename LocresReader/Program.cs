using System.Text.Json;
using CUE4Parse.Compression;
using CUE4Parse.Encryption.Aes;
using CUE4Parse.FileProvider;
using CUE4Parse.MappingsProvider;
using CUE4Parse.UE4.Localization;
using CUE4Parse.UE4.Objects.Core.Misc;
using CUE4Parse.UE4.Versions;
using Newtonsoft.Json;

namespace LocresReader;

public class InputConfig
{
    public string? UsmapPath { get; set; }
    public string? AesKey { get; set; }
    public string? PaksDirectory { get; set; }
    public string? LocresPath { get; set; }
}

public class Program
{
    private const string DefaultAesKey = "0x0C263D8C22DCB085894899C3A3796383E9BF9DE0CBFB08C9BF2DEF2E84F29D74";
    private const string DefaultPaksDirectory = @"E:\SteamLibrary\steamapps\common\MarvelRivals\MarvelGame\Marvel\Content\Paks";
    private const string DefaultLocresPath = "Marvel/Content/Localization/Game/en/Game.locres";

    private static void Log(string message) => Console.Error.WriteLine(message);

    public static async Task Main(string[] args)
    {
        string? usmapPath = null;
        string aesKey = DefaultAesKey;
        string paksDirectory = DefaultPaksDirectory;
        string locresPath = DefaultLocresPath;

        var input = Console.ReadLine();

        if (!string.IsNullOrWhiteSpace(input))
        {
            try
            {
                var config = System.Text.Json.JsonSerializer.Deserialize<InputConfig>(input, new JsonSerializerOptions
                {
                    PropertyNameCaseInsensitive = true
                });

                if (config != null)
                {
                    usmapPath = config.UsmapPath;
                    if (!string.IsNullOrWhiteSpace(config.AesKey)) aesKey = config.AesKey;
                    if (!string.IsNullOrWhiteSpace(config.PaksDirectory)) paksDirectory = config.PaksDirectory;
                    if (!string.IsNullOrWhiteSpace(config.LocresPath)) locresPath = config.LocresPath;
                }
            }
            catch (System.Text.Json.JsonException ex)
            {
                Log($"Invalid JSON: {ex.Message}");
                Log("Using defaults...");
            }
        }

        Log($"Configuration:");
        Log($"  Usmap: {(string.IsNullOrWhiteSpace(usmapPath) ? "(none)" : usmapPath)}");
        Log($"  AES Key: {aesKey}");
        Log($"  Paks Directory: {paksDirectory}");
        Log($"  Locres Path: {locresPath}");

        try
        {
            await ReadLocresFile(usmapPath, aesKey, paksDirectory, locresPath);
        }
        catch (Exception ex)
        {
            Log($"Error: {ex.Message}");
            Log(ex.StackTrace ?? "");
        }
    }

    private static async Task ReadLocresFile(string? usmapPath, string aesKey, string paksDirectory, string locresPath)
    {
        Log("Initializing Oodle decompression...");
        
        var oodlePath = Path.Combine(AppContext.BaseDirectory, "oo2core_9_win64.dll");
        if (!File.Exists(oodlePath))
        {
            oodlePath = Path.Combine(Environment.CurrentDirectory, "oo2core_9_win64.dll");
        }
        
        if (File.Exists(oodlePath))
        {
            Log($"Found Oodle DLL at: {oodlePath}");
            OodleHelper.Initialize(oodlePath);
        }
        else
        {
            Log("WARNING: Oodle DLL not found. Decompression may fail.");
        }
        
        Log("Initializing file provider...");

        var provider = new DefaultFileProvider(
            paksDirectory,
            SearchOption.AllDirectories,
            new VersionContainer(EGame.GAME_MarvelRivals),
            StringComparer.OrdinalIgnoreCase
        );

        if (!string.IsNullOrWhiteSpace(usmapPath) && File.Exists(usmapPath))
        {
            Log($"Loading usmap from: {usmapPath}");
            provider.MappingsContainer = new FileUsmapTypeMappingsProvider(usmapPath);
        }

        Log("Scanning pak files...");
        provider.Initialize();

        Log($"Found {provider.UnloadedVfs.Count} unloaded pak files.");

        Log("Submitting AES key...");
        var key = new FAesKey(aesKey);
        var mountedCount = await provider.SubmitKeyAsync(new FGuid(), key);

        Log($"Mounted {mountedCount} paks with the provided key.");
        Log($"Total files available: {provider.Files.Count}");

        Log($"Searching for locres file: {locresPath}");

        var matchingFiles = provider.Files.Keys
            .Where(k => k.Contains("Localization", StringComparison.OrdinalIgnoreCase) && 
                       k.EndsWith(".locres", StringComparison.OrdinalIgnoreCase))
            .ToList();

        Log($"Found {matchingFiles.Count} locres files");

        var targetFile = provider.Files.Keys
            .FirstOrDefault(k => k.Equals(locresPath, StringComparison.OrdinalIgnoreCase) ||
                                k.EndsWith(locresPath, StringComparison.OrdinalIgnoreCase) ||
                                k.EndsWith(locresPath.Replace("/", "\\"), StringComparison.OrdinalIgnoreCase));

        if (targetFile == null)
        {
            // Extract language from locresPath (e.g., "Marvel/Content/Localization/Game/en/Game.locres" -> "en")
            var langMatch = System.Text.RegularExpressions.Regex.Match(locresPath, @"/([^/]+)/[^/]+\.locres$");
            var language = langMatch.Success ? langMatch.Groups[1].Value : "en";
            
            var altPath = $"Game/Content/Localization/Game/{language}/Game.locres";
            targetFile = provider.Files.Keys
                .FirstOrDefault(k => k.EndsWith(altPath, StringComparison.OrdinalIgnoreCase) ||
                                    k.Contains(altPath, StringComparison.OrdinalIgnoreCase));
        }

        if (targetFile == null && matchingFiles.Count > 0)
        {
            // Extract language from locresPath for fallback search
            var langMatch = System.Text.RegularExpressions.Regex.Match(locresPath, @"/([^/]+)/[^/]+\.locres$");
            var language = langMatch.Success ? langMatch.Groups[1].Value : "en";
            
            var langLocres = matchingFiles.FirstOrDefault(f => f.Contains($"/{language}/", StringComparison.OrdinalIgnoreCase) && 
                                                              !f.Contains("Engine", StringComparison.OrdinalIgnoreCase));
            if (langLocres == null)
                langLocres = matchingFiles.FirstOrDefault(f => f.Contains($"/{language}/", StringComparison.OrdinalIgnoreCase));
            targetFile = langLocres ?? matchingFiles.First();
        }

        if (targetFile == null)
        {
            Log("ERROR: Could not find the specified locres file.");
            return;
        }

        Log($"Reading locres file: {targetFile}");

        var gameFile = provider.Files[targetFile];
        
        byte[]? fileBytes = null;
        try
        {
            fileBytes = gameFile.Read();
        }
        catch (Exception ex)
        {
            Log($"gameFile.Read() failed: {ex.Message}");
        }
        
        if (fileBytes != null && fileBytes.Length > 0)
        {
            Log($"File size: {fileBytes.Length} bytes");
            
            using var archive = new CUE4Parse.UE4.Readers.FByteArchive(targetFile, fileBytes, provider.Versions);
            
            var locres = new FTextLocalizationResource(archive);

            var settings = new JsonSerializerSettings
            {
                Formatting = Formatting.None,
                StringEscapeHandling = StringEscapeHandling.EscapeNonAscii
            };
            var locJson = JsonConvert.SerializeObject(locres, settings);
            Console.WriteLine(locJson);
            
            Log("Done.");
        }
        else
        {
            Log("gameFile.Read() returned null, trying TryCreateReader...");
            
            if (gameFile.TryCreateReader(out var archive))
            {
                var locres = new FTextLocalizationResource(archive);
                var settings = new JsonSerializerSettings
                {
                    Formatting = Formatting.None,
                    StringEscapeHandling = StringEscapeHandling.EscapeNonAscii
                };
                var locJson = JsonConvert.SerializeObject(locres, settings);
                Console.WriteLine(locJson);
                Log("Done.");
            }
            else
            {
                Log("ERROR: TryCreateReader also failed.");
            }
        }
    }
}
