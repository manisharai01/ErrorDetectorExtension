using System;
using System.Data.SqlClient;
using System.Threading.Tasks;

namespace Sample
{
    public class BadService
    {
        // IED-T009: null-forgiving operator
        public string GetName(User? user)
        {
            var name = user!.Name;
            return name;
        }

        // IED-S019: SQL built by string concatenation with a variable
        public void RunQuery(SqlConnection conn, string userId)
        {
            var sql = "SELECT * FROM users WHERE id = " + userId;
            var interp = $"DELETE FROM users WHERE id = {userId}";
            using var cmd = new SqlCommand(sql, conn);
            using var cmd2 = new SqlCommand(interp, conn);
        }

        // IED-C013: async void method
        public async void FireAndForget()
        {
            await Task.Delay(10);
        }

        // IED-Q017: Console debug output
        public void Debug(int id)
        {
            Console.WriteLine("processing " + id);
            Console.Write("done");
        }

        // IED-L019: empty catch block swallows the exception
        public void Save()
        {
            try
            {
                DoSave();
            }
            catch (Exception e)
            {
            }
        }

        private void DoSave() { }
    }

    public class User
    {
        public string Name { get; set; } = "";
    }
}
