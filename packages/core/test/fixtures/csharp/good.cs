using System;
using System.Data.SqlClient;
using System.Threading.Tasks;
using Microsoft.Extensions.Logging;

namespace Sample
{
    public class GoodService
    {
        private readonly ILogger _logger;

        public GoodService(ILogger logger)
        {
            _logger = logger;
        }

        // No null-forgiving: explicit null check instead.
        public string GetName(User? user)
        {
            if (user is null)
            {
                return string.Empty;
            }
            return user.Name;
        }

        // Parameterized query: no concatenation of user input into SQL.
        public void RunQuery(SqlConnection conn, string userId)
        {
            using var cmd = new SqlCommand("SELECT * FROM users WHERE id = @id", conn);
            cmd.Parameters.AddWithValue("@id", userId);

            // A plain string concatenation without SQL keywords is fine.
            var greeting = "hello " + userId;
            _logger.LogInformation(greeting);
        }

        // Returns Task, not void.
        public async Task FireAndForget()
        {
            await Task.Delay(10);
        }

        // Uses a logger rather than Console.
        public void Report(int id)
        {
            _logger.LogInformation("processing {Id}", id);
        }

        // Catch block actually handles the exception.
        public void Save()
        {
            try
            {
                DoSave();
            }
            catch (Exception e)
            {
                _logger.LogError(e, "save failed");
                throw;
            }
        }

        private void DoSave() { }
    }

    public class User
    {
        public string Name { get; set; } = "";
    }
}
